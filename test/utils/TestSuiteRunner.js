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

    genTests(stepsToGen) {

        const stepsToFilterFor = [].concat(stepsToGen).filter((item) => item);

        const { expect, lab: { describe, it }, utils } = this.testUtils;

        let filteredTests = this.testsInSuite;

        if (stepsToFilterFor.length > 0) {
            filteredTests = this.testsInSuite.filter((testName) => {

                return stepsToFilterFor.find((filterSearch) => {

                    return testName.indexOf(filterSearch) !== -1;
                });
            });

            console.log('Tests filtered to run:', filteredTests);
        };

        describe(`"${this.session.options.knexConfig.client} ${this.testType}" tests:`, () => {

            filteredTests.forEach((testName) => {

                const rootSession = this.session;
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

                it(itText, (done) => {

                    // Clone a new session for each test
                    // This also wipes the db for a fresh start =)

                    const session = TestSession.cloneSession(this.session, () => {

                        const dbInitialized = () => {

                            const testModels = this.getModels(Path.join(testPath, 'models'), session);

                            // empty migrationsDir folder (cleanup)

                            Fs.readdirSync(migrationsDir)
                            .forEach((migrationFile) => {

                                const filePath = Path.join(migrationsDir, migrationFile);
                                Fs.unlinkSync(filePath);
                            });

                            SchwiftyMigration.genMigrationFile({
                                models: testModels,
                                migrationsDir,
                                knex: session.knex,
                                mode: 'test',
                                migrationName: `it-${itText.split(' ').join('-')}`
                            }, (err) => {

                                if (err) {
                                    if (Array.isArray(err)) {
                                        return done(new Error(`Multiple errors: "${err}"`));
                                    }
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

                                expect(actualMigrationContents).to.equal(expectedMigrationContents);

                                done();
                            });
                        };

                        if (seedMigration) {

                            // This is a func in test/index.js
                            this.testUtils.setOptionsForAfter(session, seedPath);

                            session.knex.migrate.latest({
                                directory: seedPath
                            })
                            .then((...args) => {

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
