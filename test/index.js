'use strict';

// Load modules

const Os = require('os');
const Fs = require('fs');
const Path = require('path');

const Lab = require('lab');
const Code = require('code');
const Hoek = require('hoek');

const KnexConfigs = require('./knexfile');
const TestSession = require('./utils/TestSession');
const TestSuiteRunner = require('./utils/TestSuiteRunner');
const SchwiftyMigration = require('../lib');
const Mappings = require('../lib/mappings');

// Test shortcuts

const lab = exports.lab = Lab.script({ schedule: false });
const expect = Code.expect;
const { describe, it, before } = lab;
const Utils = require('./utils');

const internals = {};

internals.cleanup = (session, done) => {

    if (!session) {
        return done();
    }

    Utils.wipeDb(session, (err) => {

        if (err) {
            return done(err);
        }

        const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

        Fs.readdirSync(absolutePath)
            .forEach((migrationFile) => {

                const filePath = Path.join(absolutePath, migrationFile);
                Fs.unlinkSync(filePath);
            });

        session.knex.destroy().asCallback(done);
    });
};

internals.setupCleanup = (onCleanup, session, extras) => {

    if (typeof extras !== 'function') {
        extras = (done) => done();
    }

    extras((err) => {

        Hoek.assert(!err, `Err in cleanup: "${err}"`);
        process.nextTick(() => onCleanup(internals.cleanup.bind(null, session)));
    });
};

internals.makeSession = (cb) => {

    const session = new TestSession({ options: { knexConfig } },
        (err) => {

            cb(err, session);
        });
};

internals.failKnexWith = (knex, toErrorOn, errMsg, afterTries) => {

    afterTries = afterTries || 1;

    // Based this patching technique off https://github.com/tgriesser/knex/blob/2e1a459a9e740f24b9a4647bd4da427854e551dd/test/integration/logger.js#L89-L108

    const originalQb = knex.queryBuilder;
    knex.queryBuilder = () => {

        const qb = originalQb.apply(this, arguments);
        const origToErrorFunc = qb[toErrorOn].bind(qb);

        qb[toErrorOn] = (...args) => {

            if (--afterTries === 0) {
                return knex.Promise.reject(new Error(errMsg));
            }
            return origToErrorFunc(...args);
        };
        return qb;
    };

    return knex;
};

internals.testUtils = {
    lab,
    expect,
    utils: Utils,
    setupCleanup: internals.setupCleanup
};

const envDB = process.env.DB;
const testDb = envDB || 'postgres';

const knexConfig = KnexConfigs.find((conf) => conf.client === testDb);

Hoek.assert(knexConfig, `Unsupported db "${testDb}"`);

describe('SchwiftyMigration', () => {

    before((done) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            Utils.wipeDb(session, (err) => {

                if (err) {
                    return done(err);
                }
                session.knex.destroy().asCallback(done);
            });
        });
    });

    it('accepts absolute and relative migration file paths', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
            const relativePath = './test/migration-tests/migrations';

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.not.exist();

                SchwiftyMigration.genMigrationFile({
                    models: [require('./migration-tests/Dog')],
                    migrationsDir: relativePath,
                    knex: session.knex,
                    migrationName: 'test'
                }, (err) => {

                    expect(err).to.not.exist();
                    done();
                });
            });
        });
    });

    it('returns NO_MIGRATION when the db and models are in sync (no-op)', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/Person')],
                        migrationsDir,
                        knex: session.knex,
                        migrationName: 'test'
                    }, (err, output) => {

                        expect(err).to.not.exist();

                        expect(Utils.validateOutput(output, {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: []
                        })).to.equal(true);

                        Fs.readdirSync(migrationsDir)
                            .forEach((migrationFile) => {

                                const filePath = Path.join(migrationsDir, migrationFile);
                                Fs.unlinkSync(filePath);
                            });

                        done();
                    });
                });
        });
    });

    it('returns NO_MIGRATION if no models passed', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            SchwiftyMigration.genMigrationFile({
                models: [],
                migrationsDir: 'some/path',
                knex: session.knex,
                migrationName: 'test'
            }, (err, output) => {

                expect(err).to.not.exist();

                expect(Utils.validateOutput(output, {
                    code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                    file: null,
                    skippedColumns: []
                })).to.equal(true);

                done();
            });
        });
    });

    it('suppresses alter and drop actions if mode is set to "create"', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/AlterPerson')],
                        migrationsDir,
                        knex: session.knex,
                        mode: 'create',
                        migrationName: 'test'
                    }, (err) => {

                        expect(err).to.not.exist();

                        const expectedMigrationPath = './test/migration-tests/mode-enforcement/create-mode/expected-migration.js';
                        const actualMigrationContents = internals.testUtils.utils.getLatestMigration(migrationsDir);
                        const expectedMigrationContents = Fs.readFileSync(expectedMigrationPath).toString('utf8');

                        expect(actualMigrationContents).to.equal(expectedMigrationContents);

                        Fs.readdirSync(migrationsDir)
                            .forEach((migrationFile) => {

                                const filePath = Path.join(migrationsDir, migrationFile);
                                Fs.unlinkSync(filePath);
                            });

                        done();
                    });
                });
        });
    });

    it('returns generated migration file path on success', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err, output) => {

                expect(err).to.not.exist();

                expect(Utils.validateOutput(output, {
                    code: SchwiftyMigration.returnCodes.MIGRATION,
                    file: 'truthy',
                    skippedColumns: []
                })).to.equal(true);

                done();
            });
        });
    });

    // All the errors

    it('errors if you give bad options', (done, onCleanup) => {

        SchwiftyMigration.genMigrationFile({
            invalid: 'options!'
        }, (err) => {

            expect(err).to.exist();
            expect(err.message).to.equal('Bad options passed to schwifty-migrate-diff: child \"migrationsDir\" fails because [\"migrationsDir\" is required]');
            done();
        });
    });

    it('errors when Fs.writeFile fails', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const origWriteFile = Fs.writeFile;

            internals.testUtils.setupCleanup(onCleanup, session, (done) => {

                Fs.writeFile = origWriteFile;
                done();
            });

            let afterTries = 2;

            Fs.writeFile = (...args) => {

                if (--afterTries === 0) {
                    const cb = args.pop();
                    return cb(new Error('write failed'));
                }

                return origWriteFile.apply(this, args);
            };

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('write failed');

                done();
            });
        });
    });

    it('errors on a knex that isn\'t pingable', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const badKnex = internals.failKnexWith(session.knex, 'select', 'Not pingable');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Not pingable');

                done();
            });
        });
    });

    it('errors on a knex that has issues pinging a table', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            // The first time schwifty-migrate-diff uses `select` is when pinging the
            // db for general connectivity. The next time it uses `select` will be
            // when pinging for each table's existance in the db

            // So we ask failKnexWith to fail after 2 tries to make it work correctly for the first select
            // and fail on the 2nd one.
            const badKnex = internals.failKnexWith(session.knex, 'select', 'Error when pinging table', 2);

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Error when pinging table');

                done();
            });
        });
    });

    it('errors if knex migrate fails', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            // Setting the migrations dir path to a file
            const absoluteBadPath = Path.join(process.cwd(), 'test/migration-tests/Person.js');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absoluteBadPath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.include('ENOTDIR: not a directory, open \'' + absoluteBadPath);
                done();
            });
        });
    });

    it('informs user of skipped unsupported db column types with other changes', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_psql_column polygon';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.MIGRATION,
                            file: 'truthy',
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE Person ADD weirdo_mysql_column SET("a", "b", "c")';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.MIGRATION,
                            file: 'truthy',
                            skippedColumns: ['set']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [require('./migration-tests/AlterPerson')],
                                migrationsDir,
                                knex: session.knex,
                                migrationName: 'test'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.validateOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('informs user of skipped unsupported db column types and no other changes', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_psql_column polygon';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE Person ADD weirdo_mysql_column SET("a", "b", "c")';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['set']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [require('./migration-tests/Person')],
                                migrationsDir,
                                knex: session.knex,
                                migrationName: 'test'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.validateOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('informs user of skipped unsupported db column types on join table', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed-join';

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person_Movie" ADD weirdo_psql_column polygon';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE Person_Movie ADD weirdo_mysql_column SET("a", "b", "c")';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['set']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [
                                    require('./migration-tests/Person'),
                                    require('./migration-tests/Movie')
                                ],
                                migrationsDir,
                                knex: session.knex,
                                migrationName: 'test'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.validateOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('errors on unsupported Joi schema in model', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/BadPerson')],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives" not supported in model "BadPerson".');
                done();
            });
        });
    });

    it('errors when knex\'s columnInfo fails for regular model', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const badKnex = internals.failKnexWith(session.knex, 'columnInfo', 'Column info fail regular model');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Column info fail regular model');

                done();
            });
        });
    });

    it('errors when knex\'s columnInfo fails for join table', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const badKnex = internals.failKnexWith(session.knex, 'columnInfo', 'Column info fail join table');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/Movie'),
                    require('./migration-tests/Person_Movie')
                ],
                migrationsDir: 'some/path',
                knex: badKnex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Column info fail join table');

                done();
            });
        });
    });

    it('errors when a join table uses an unsupported Joi schema', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/BadMovie'),
                    require('./migration-tests/Bad_Person_Movie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives" not supported in model "Bad_Person_Movie".');

                done();
            });
        });
    });

    it('errors when a join table uses multiple unsupported Joi schema features', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/DoubleBadMovie'),
                    require('./migration-tests/Double_Bad_Person_Movie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives, alternatives" not supported in model "Double_Bad_Person_Movie".');

                done();
            });
        });
    });

    it('errors when multiple tables use unsupported Joi schema features', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/BadPerson'),
                    require('./migration-tests/BadZombie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                migrationName: 'test'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Multiple errors:' + Os.EOL +
                'Joi Schema type(s) "alternatives" not supported in model "BadPerson".' + Os.EOL +
                'Joi Schema type(s) "alternatives" not supported in model "BadZombie".');

                done();
            });
        });
    });

    describe('mappings.js', () => {

        it('maintains parity between output of db2ColumnCompiler and input of columnCompiler2Knex', (done) => {

            const aliasKeys = Object.keys(Mappings.maps.aliasMap);
            const columnCompilerKnexMapKeys = Object.keys(Mappings.maps.columnCompilerKnexMap);

            aliasKeys.forEach((key) => {

                expect(columnCompilerKnexMapKeys.includes(key)).to.equal(true);
            });

            done();
        });

        it('returns error early from db2Knex if problems arise in "db2ColumnCompiler"', (done) => {

            const [err, val] = Mappings.convertFuncs.db2Knex('bogusType');

            expect(err.message).to.equal('Alias not found for bogusType.');
            expect(val).to.not.exist();

            done();
        });
    });

    // Generated, file-based tests (uses the migration-tests folder)

    it('creates new tables and columns', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            // Run migration tests for `create`
            const createRunner = new TestSuiteRunner('create', session, internals.testUtils);
            createRunner.genTests();

            done();
        });
    });

    it('alters tables', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            // Run migration tests for `alter`
            const alterRunner = new TestSuiteRunner('alter', session, internals.testUtils);
            alterRunner.genTests();

            done();
        });
    });

    it('integration testing', (done, onCleanup) => {

        internals.makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            internals.testUtils.setupCleanup(onCleanup, session);

            // Run migration tests for `alter`
            const integrationRunner = new TestSuiteRunner('integrated', session, internals.testUtils);
            integrationRunner.genTests();

            done();
        });
    });
});
