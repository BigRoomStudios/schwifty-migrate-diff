
const Path = require('path');
const Fs = require('fs');
const Hoek = require('hoek');
const SchwiftyMigration = require('../..');

module.exports = class TestRunner {

    constructor(testType, session, testUtils) {

        this.testType = testType;
        this.session = session;
        this.testUtils = testUtils;

        this.testSuitePath = Path.join(__dirname, '../migration-tests', testType);
        this.testsInSuite = Fs.readdirSync(this.testSuitePath);
    }

    genTests() {

        this.testsInSuite.forEach((testName) => {

            const testPath = Path.join(this.testSuitePath, testName);
            const testModels = this.getModels(Path.join(testPath, 'models'));
            const itText = require(Path.join(testPath, 'it'));

            this.testUtils.it(itText, (done) => {


                /////
            });
        });
    }

    getModels(modelsPath) {

        return Fs.readdirSync(modelsPath)
        .map((modelFileName) => {

            return require(Path.join(modelsPath, modelFileName));
        })
        .map((model) => {

            return model.bindKnex(this.session.knex); // Bind to the session's knex
        });
    }
};
