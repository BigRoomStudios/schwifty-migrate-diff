'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Path = require('path');
const Fs = require('fs');
const KnexConfigs = require('./knexfile');
const TestSession = require('./utils/TestSession');
const TestSuiteRunner = require('./utils/TestSuiteRunner');
const SchwiftyMigration = require('../lib');

// Test shortcuts

const lab = exports.lab = Lab.script({ schedule: false });
const expect = Code.expect;
const { describe, it, afterEach } = lab;
const Utils = require('./utils');

const internals = {};

afterEach((done) => {

    const { sessionForAfter, rollbackPath } = internals;

    if (rollbackPath) {

        // Wipe the db!

        Utils.rollbackDb(sessionForAfter, rollbackPath, () => {

            internals.sessionForAfter = undefined;
            done();
        });
    }
    else {
        internals.sessionForAfter = undefined;
        internals.rollbackPath = undefined;

        if (!sessionForAfter) {
            return done();
        }

        sessionForAfter.knex.destroy()
            .asCallback((err) => {

                done(err);
            });
    }
});

const setOptionsForAfter = (session, rollbackPath) => {

    internals.sessionForAfter = session;
    internals.rollbackPath = rollbackPath;
};

const testUtils = {
    lab,
    expect,
    utils: Utils,
    setOptionsForAfter
};

const envDB = process.env.DB;
const testDb = envDB || 'postgres';

const knexConfig = KnexConfigs.find((conf) => conf.client === testDb);

if (!knexConfig) {
    throw new Error(`Unsupported db "${testDb}"`);
}

describe('SchwiftyMigration', () => {

    const makeSession = (cb) => {

        const session = new TestSession({ options: { knexConfig } },
            (err) => {

                setOptionsForAfter(session);
                cb(err, session);
            });
    };

    const failKnexWith = (knex, toErrorOn, errMsg) => {

        // Grabbed this technique from https://github.com/tgriesser/knex/blob/2e1a459a9e740f24b9a4647bd4da427854e551dd/test/integration/logger.js#L89-L108

        const originalQb = knex.queryBuilder;
        knex.queryBuilder = (...args) => {

            const qb = originalQb.apply(this, arguments);

            qb[toErrorOn] = () => {

                return Promise.reject(new Error(errMsg));
            };
            return qb;
        };

        return knex;
    };

    it('errors if you give bad options', (done) => {

        SchwiftyMigration.genMigrationFile({
            invalid: 'options!'
        }, (err) => {

            expect(err).to.exist();
            expect(err.message).to.equal('Bad options passed to schwifty-migration: child \"migrationsDir\" fails because [\"migrationsDir\" is required]');
            done();
        });
    });

    it('errors on a knex that isn\'t pingable', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const badKnex = failKnexWith(session.knex, 'select', 'Not pingable');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Not pingable');

                done();
            });
        });
    });

    it('Errors if "No models passed"', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            SchwiftyMigration.genMigrationFile({
                models: [],
                migrationsDir: 'some/path',
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('No models passed');

                done();
            });
        });
    });

    it('accepts absolute and relative migration file paths', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
            const relativePath = './test/migration-tests/migrations';

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.not.exist();

                SchwiftyMigration.genMigrationFile({
                    models: [require('./migration-tests/Dog')],
                    migrationsDir: relativePath,
                    knex: session.knex,
                    mode: 'alter'
                }, (err) => {

                    expect(err).to.not.exist();

                    Fs.readdirSync(absolutePath)
                        .forEach((migrationFile) => {

                            const filePath = Path.join(absolutePath, migrationFile);
                            Fs.unlinkSync(filePath);
                        });

                    done();
                });
            });
        });
    });

    it('Returns "No migration needed" when the db and models are in sync (no-op)', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .then(() => {

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/Person')],
                        migrationsDir,
                        knex: session.knex,
                        mode: 'alter'
                    }, (err, output) => {

                        expect(err).to.not.exist();
                        expect(output).to.equal('No migration needed');

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

    it('Suppresses alter and drop actions if mode is not set to "alter"', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .then(() => {

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/AlterPerson')],
                        migrationsDir,
                        knex: session.knex,
                        mode: 'create'
                    }, (err) => {

                        expect(err).to.not.exist();

                        const expectedMigrationPath = './test/migration-tests/mode-enforcement/create-mode/expected-migration.js';
                        const actualMigrationContents = testUtils.utils.getLatestMigration(migrationsDir);
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

    it('Prints to the console on successful migration file generation', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err, output) => {

                expect(err).to.not.exist();

                expect(output.includes('_schwifty-migration.js')).to.equal(true);

                Fs.readdirSync(absolutePath)
                    .forEach((migrationFile) => {

                        const filePath = Path.join(absolutePath, migrationFile);
                        Fs.unlinkSync(filePath);
                    });

                done();
            });
        });
    });

    it('errors on unsupported Joi schema in model', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/BadPerson')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives" not supported.');
                done();
            });
        });
    });

    it('errors when knex\'s columnInfo fails', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const badKnex = failKnexWith(session.knex, 'columnInfo', 'Column info fail');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Column info fail');

                done();
            });
        });
    });

    it('creates new tables and columns', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `create`
            const createRunner = new TestSuiteRunner('create', session, testUtils);
            createRunner.genTests();

            done();
        });
    });

    it('alters tables', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `alter`
            const alterRunner = new TestSuiteRunner('alter', session, testUtils);
            alterRunner.genTests();

            done();
        });
    });

    it('integration testing', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `alter`
            const integrationRunner = new TestSuiteRunner('integrated', session, testUtils);
            integrationRunner.genTests();

            done();
        });
    });
});
