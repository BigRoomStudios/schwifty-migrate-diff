
const Path = require('path');
const Fs = require('fs');
const Hoek = require('hoek');
const SchwiftyMigration = require('../../lib');

module.exports = class TestRunner {

    constructor(testType, session, testUtils) {

        this.testType = testType;
        this.session = session;
        this.testUtils = testUtils;

        this.testSuitePath = Path.join(__dirname, '../migration-tests', testType);
        this.testsInSuite = Fs.readdirSync(this.testSuitePath);
    }

    genTests() {

        const { expect, lab: { describe, it }, utils } = this.testUtils;

        describe(`"${this.testType}" tests:`, () => {

            this.testsInSuite.forEach((testName) => {

                const testPath = Path.join(this.testSuitePath, testName);
                const testModels = this.getModels(Path.join(testPath, 'models'));
                const itText = require(Path.join(testPath, 'it'));

                it(itText, (done) => {

                    SchwiftyMigration.genMigrationFile({
                        models: testModels,
                        migrationsDir: Path.join(testPath, 'migrations'),
                        knex: this.session.knex,
                        mode: 'test',
                        migrationName: `it-${itText.split(' ').join('-')}`
                    }, (err) => {

                        expect(err).to.not.exist();
                        done();
                    });
                });
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
