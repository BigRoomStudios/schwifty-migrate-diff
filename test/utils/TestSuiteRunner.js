'use strict';

const Path = require('path');
const Fs = require('fs');
const SchwiftyMigration = require('../../lib');
const TestSession = require('./TestSession');

module.exports = class TestRunner {

    constructor(testType, session, testUtils) {

        this.testType = testType;
        this.session = session;

        this.testUtils = testUtils;

        this.testSuitePath = Path.join(__dirname, '../migration-tests', testType);
        this.testsInSuite = Fs.readdirSync(this.testSuitePath).filter((maybeDir) => {

            const stats = Fs.statSync(Path.join(this.testSuitePath, maybeDir));
            return stats.isDirectory();
        });
    }

    genTests() {

        const { expect, lab: { describe, it }, utils } = this.testUtils;

        const rootSession = this.session;

        describe(`"${rootSession.options.knexConfig.client} ${this.testType}" tests:`, () => {

            this.testsInSuite.forEach((testName) => {

                const testPath = Path.join(this.testSuitePath, testName);
                const itText = require(Path.join(testPath, 'it'));
                const seedPath = Path.join(testPath, 'seed');
                let seedMigration;

                if (Fs.existsSync(seedPath)) {
                    seedMigration = true;
                }

                const parentMigrationsDir = Path.join(testPath, 'migrations');
                const migrationsDir = Path.join(parentMigrationsDir, rootSession.options.knexConfig.client);

                if (!Fs.existsSync(parentMigrationsDir)) {
                    Fs.mkdirSync(parentMigrationsDir);
                }

                if (!Fs.existsSync(migrationsDir)) {
                    Fs.mkdirSync(migrationsDir);
                }

                const expectedMigrationPath = Path.join(testPath, 'expected-migration.js');

                it(itText, (done, onCleanup) => {

                    // Clone a new session for each test
                    // This also wipes the db for a fresh start =)

                    const session = TestSession.cloneSession(rootSession, () => {

                        this.testUtils.setupCleanup(onCleanup, session, (done) => {

                            Fs.readdirSync(migrationsDir)
                                .forEach((migrationFile) => {

                                    const filePath = Path.join(migrationsDir, migrationFile);
                                    Fs.unlinkSync(filePath);
                                });
                            done();
                        });

                        const dbInitialized = (err) => {

                            if (err) {
                                return done(err);
                            }

                            const testModels = this.getModels(Path.join(testPath, 'models'), session);

                            SchwiftyMigration.genMigrationFile({
                                models: testModels,
                                migrationsDir,
                                knex: session.knex,
                                migrationName: `it-${itText.split(' ').join('-')}`
                            }, (err, output) => {

                                if (err) {
                                    return done(err);
                                }

                                const actualMigrationContents = utils.getLatestMigration(migrationsDir);
                                const expectedMigrationContents = Fs.readFileSync(expectedMigrationPath).toString('utf8');

                                if (actualMigrationContents !== expectedMigrationContents) {
                                    console.error('');
                                    console.error('');
                                    console.error(`Problem with "${itText}"`);
                                    console.error('');
                                }

                                // Ensure the migration matches expected
                                expect(actualMigrationContents).to.equal(expectedMigrationContents);

                                expect(utils.validateOutput(output, {
                                    code: SchwiftyMigration.returnCodes.MIGRATION,
                                    file: 'truthy',
                                    skippedColumns: []
                                })).to.equal(true);

                                // Now run the just created migration to make sure the code is valid!

                                if (seedMigration) {
                                    const seedFileName = Fs.readdirSync(seedPath)[0];
                                    const seedFilePath = Path.resolve(seedPath, seedFileName);
                                    const seedContents = Fs.readFileSync(seedFilePath).toString('utf8');

                                    // Copy the seed file into the migration dir then run the migration
                                    Fs.writeFileSync(Path.join(migrationsDir, seedFileName), seedContents);
                                }

                                // Let's migrate our generated file and then
                                // run genMigrationFile again, expecting to see
                                // 'No migration needed'

                                session.knex.migrate.latest({
                                    directory: migrationsDir
                                })
                                    .asCallback((err) => {

                                        if (err) {
                                            return done(err);
                                        }

                                        SchwiftyMigration.genMigrationFile({
                                            models: testModels,
                                            migrationsDir,
                                            knex: session.knex,
                                            migrationName: 'test'
                                        }, (err, noMigrationNeededOutput) => {

                                            if (err) {
                                                return done(err);
                                            }

                                            expect(utils.validateOutput(noMigrationNeededOutput, {
                                                code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                                                file: null,
                                                skippedColumns: []
                                            })).to.equal(true);

                                            // Finally, we'll test the rollback code
                                            // let's rollback this migration,
                                            // generate a new migration file,
                                            // then ensure the contents are what we expect

                                            utils.rollbackDbOnce(session, migrationsDir, (err) => {

                                                // We should be all rolled back now
                                                expect(err).to.not.exist();

                                                // Delete the migration file (leave seed file(s))

                                                Fs.unlinkSync(output.file);

                                                SchwiftyMigration.genMigrationFile({
                                                    models: testModels,
                                                    migrationsDir,
                                                    knex: session.knex,
                                                    migrationName: 'after-rollback'
                                                }, (err, afterRollbackOutput) => {

                                                    if (err) {
                                                        return done(err);
                                                    }

                                                    expect(utils.validateOutput(afterRollbackOutput, {
                                                        code: SchwiftyMigration.returnCodes.MIGRATION,
                                                        file: 'truthy',
                                                        skippedColumns: []
                                                    })).to.equal(true);

                                                    expect(Fs.readFileSync(afterRollbackOutput.file).toString('utf8')).to.equal(expectedMigrationContents);
                                                    done();
                                                });
                                            });
                                        });
                                    });
                            });
                        };

                        if (seedMigration) {

                            // This is a func in test/index.js

                            session.knex.migrate.latest({
                                directory: seedPath
                            })
                                .asCallback((err) => {

                                    if (err) {
                                        return dbInitialized(err);
                                    }

                                    dbInitialized();
                                });
                        }
                        else {
                            dbInitialized();
                        }
                    });
                });
            });
        });
    }

    getModels(modelsPath, session) {

        return Fs.readdirSync(modelsPath)
            .map((modelFileName) => {

                return require(Path.join(modelsPath, modelFileName));
            })
            .map((model) => {

                return model.bindKnex(session.knex); // Bind to the session's knex
            });
    }
};
