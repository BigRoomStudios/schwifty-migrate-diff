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

const internals = {};


const rollbackDb = (session, rollbackPath, next) => {

    const { knex } = session;
    const config = Object.assign(
        {},
        session.options.knexConfig,
        { directory: rollbackPath }
    );

    knex.migrate.currentVersion()
    .then((cv) => {

        if (cv !== 'none') {
            return knex.migrate.rollback(config)
            .then(() => {

                rollbackDb(session, rollbackPath, next);
            })
            .catch(next);
        }
        next();
    });
}

lab.afterEach((done) => {

    // setOptionsForAfter() sets these, and setOptionsForAfter()
    // gets called in the TestRunner

    const { sessionForAfter, rollbackPath } = internals;

    if (sessionForAfter) {

        // Wipe the db!

        rollbackDb(sessionForAfter, rollbackPath, () => {

            internals.sessionForAfter = undefined;
            done();
        });
    }
    else {
        internals.sessionForAfter = undefined;
        done();
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

// const testDbs = ['sqlite3', 'mysql', 'postgres'];
// const testDbs = ['postgres', 'mysql'];
const testDbs = ['postgres'];

describe('SchwiftyMigration', () => {

    let initSessions = [];

    const getSessions = () => {

        const sessions = [];

        const promises = KnexConfigs.filter((knexConfig) => {

            // Only test the dbs specified in the `testDbs` array
            return testDbs.indexOf(knexConfig.client) !== -1;
        })
        .map((knexConfig) => {

            return new Promise((resolve, reject) => {

                // Create all the test sessions

                sessions.push(new TestSession({
                    options: { knexConfig },
                    next: () => {

                        resolve(...sessions);
                    }
                }));
            });
        });

        return Promise.all(promises);
    };

    before({ timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {

            getSessions()
            .then((args) => {

                initSessions = args;
                resolve(args);
            });
        });
    });

    // it('throws if you give bad options', (done) => {
    //
    //     expect(() => {
    //
    //         SchwiftyMigration.genMigrationFile({
    //             invalid: 'options!'
    //         });
    //     }).to.throw(/Bad options passed to schwifty-migration/);
    //
    //     done();
    // });
    //
    // it('returns early if models are empty', (done) => {
    //
    //     // This returns early enough that the other options aren't
    //     // used, so bogus ones can be passed here
    //
    //     SchwiftyMigration.genMigrationFile({
    //         models: [],
    //         migrationsDir: 'some/path',
    //         knex: class MyKnex {},
    //         mode: 'test'
    //     }, (err) => {
    //
    //         expect(err).to.not.exist();
    //         done();
    //     });
    // });
    //
    // it('accepts absolute and relative migration file paths', (done) => {
    //
    //     const session = initSessions[0];
    //
    //     const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
    //     const relativePath = './test/migration-tests/migrations';
    //
    //     SchwiftyMigration.genMigrationFile({
    //         models: [require('./migration-tests/Dog')],
    //         migrationsDir: absolutePath,
    //         knex: session.knex,
    //         mode: 'test'
    //     }, (err) => {
    //
    //         expect(err).to.not.exist();
    //
    //         SchwiftyMigration.genMigrationFile({
    //             models: [require('./migration-tests/Dog')],
    //             migrationsDir: relativePath,
    //             knex: session.knex,
    //             mode: 'test'
    //         }, (err) => {
    //
    //             expect(err).to.not.exist();
    //
    //             Fs.readdirSync(absolutePath)
    //             .forEach((migrationFile) => {
    //
    //                 const filePath = Path.join(absolutePath, migrationFile);
    //                 Fs.unlinkSync(filePath);
    //             });
    //
    //             Fs.rmdirSync(absolutePath);
    //             done();
    //         });
    //     });
    // });

    // Run incremental migrations

    // it('creates new tables and columns', (done) => {
    //
    //     initSessions.forEach((session) => {
    //
    //         // Run migration tests for `create`
    //         const createRunner = new TestSuiteRunner('create', session, testUtils);
    //         createRunner.genTests();
    //     });
    //
    //     done();
    // });

    it('alters tables', (done) => {

        initSessions.forEach((session) => {

            // Run migration tests for `alter`
            const createRunner = new TestSuiteRunner('alter', session, testUtils);
            createRunner.genTests([3]);
        });

        done();
    });
});
