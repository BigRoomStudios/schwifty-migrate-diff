'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const KnexConfigs = require('./knexfile');
const TestSession = require('./utils/TestSession');

// Test shortcuts

const lab = exports.lab = Lab.script();
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

    before(() => {

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

    // Run incremental migrations

    it('creates new models and columns', (done) => {

        testSessions.forEach((session) => {

            // Step 1 Create
            require('./create')({ session, testUtils });
        });

        done();
    });

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
