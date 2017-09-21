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
const { describe, it, before } = lab;
const Utils = require('./utils');

const testUtils = {
    lab,
    expect,
    utils: Utils
};

// const testDbs = ['sqlite3', 'mysql', 'postgres'];
const testDbs = ['postgres'];

describe('SchwiftyMigration', () => {

    const testSessions = [];

    before({ timeout: 10000 }, () => {

        const promises = KnexConfigs.filter((knexConfig) => {

            // Only test the dbs specified in the `testDbs` array
            return testDbs.indexOf(knexConfig.client) !== -1;
        })
        .map((knexConfig) => {

            return new Promise((resolve, reject) => {

                // Create all the test sessions

                testSessions.push(new TestSession({ knexConfig }, () => {

                    console.log(knexConfig.client + ' initialized!');
                    resolve();
                }));
            });
        });

        return Promise.all(promises);
    });

    it('throws if you give bad options', (done) => {

        expect(() => {

            SchwiftyMigration.genMigrationFile({
                invalid: 'options!'
            });
        }).to.throw(/Bad options passed to schwifty-migration/);

        done();
    });

    it('returns early if models are empty', (done) => {

        // This returns early enough that the other options aren't
        // used, so bogus ones can be passed here

        SchwiftyMigration.genMigrationFile({
            models: [],
            migrationsDir: 'some/path',
            knex: class MyKnex {},
            mode: 'test'
        }, (err) => {

            expect(err).to.not.exist();
            done();
        });
    });

    it('accepts absolute and relative migration file paths', (done) => {

        const session = testSessions[0];

        const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
        const relativePath = './test/migration-tests/migrations';

        SchwiftyMigration.genMigrationFile({
            models: [require('./migration-tests/Dog')],
            migrationsDir: absolutePath,
            knex: session.knex,
            mode: 'test'
        }, (err) => {

            expect(err).to.not.exist();

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: relativePath,
                knex: session.knex,
                mode: 'test'
            }, (err) => {

                expect(err).to.not.exist();

                Fs.readdirSync(absolutePath)
                .forEach((migrationFile) => {

                    const filePath = Path.join(absolutePath, migrationFile);
                    Fs.unlinkSync(filePath);
                });

                Fs.rmdirSync(absolutePath);
                done();
            });
        });
    });

    // Run incremental migrations
    //
    // it('creates new tables and columns', (done) => {
    //
    //     testSessions.forEach((session) => {
    //
    //         // Run migration tests for `create`
    //         const createRunner = new TestSuiteRunner('create', session, testUtils);
    //         createRunner.genTests();
    //     });
    //
    //     done();
    // });

    // it('alters columns', (done) => {
    //
    //     testSessions.forEach((session) => {
    //
    //         // Step 1 Create
    //         require('./alter')({ session, testUtils });
    //
    //     });
    // });
});
