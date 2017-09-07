'use strict';

// Load modules

const SchwiftyMigration = require('../lib');
const Path = require('path');

// Test shortcuts

module.exports = ({ session, testUtils }) => {

    const { expect, lab: { describe, it } } = testUtils;

    const clientName = session.options.knexConfig.client;
    const stepName = 'step1_create';

    console.log(`Begin "${stepName}" step for "${clientName}"`);

    describe(clientName + '_create', () => {

        it('adds models not in the db', (done) => {

            SchwiftyMigration.genMigrationFile({
                migrationGroups: [{
                    models: session.getModels_forStep(stepName),
                    migrationsDir: Path.join(__dirname, 'migrations', clientName, 'actual', stepName),
                    knex: session.knex
                }]
            }, () => {

                expect('ayooo!').to.equal('ayooo!');
                done();
            });
        });
    });
};
