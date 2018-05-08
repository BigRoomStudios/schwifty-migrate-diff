'use strict';

const Fs = require('fs');
const Path = require('path');
const Promise = require('bluebird');
const Code = require('code');

module.exports = {

    validateOutput: (output, expectedOutput) => {

        const { expect } = Code;

        expect(output).to.exist();
        expect(output.code).to.equal(expectedOutput.code);
        expect(output.skippedColumns).to.equal(expectedOutput.skippedColumns);

        output.file && expect(output.file).to.endWith(`${expectedOutput.file}.js`);
    },

    wipeDb: (session, done) => {

        // Wipe the db!

        if (!session) {
            return done();
        }

        const knex = session.knex;

        const tablePromises = [
            'AlterPerson',
            'Bad_Person_Movie',
            'BadMovie',
            'BadMovieWithBadPersonRef',
            'BadPerson',
            'BadZombie',
            'Dog',
            'Double_Bad_Person_Movie',
            'DoubleBadMovie',
            'Movie',
            'Person_Movie',
            'Person_Zombie',
            'Dog_Movie',
            'Person',
            'Zombie',
            // Delete this, knex will re-create it
            'knex_migrations'
        ].map((tblName) => knex.schema.dropTableIfExists(tblName));

        Promise.all(tablePromises)
            .asCallback((err) => {

                if (err) {
                    return done(err);
                }

                done();
            });
    },

    rollbackDbOnce: (session, rollbackPath, done) => {

        const { knex } = session;
        const config = Object.assign(
            {},
            session.options.knexConfig,
            { directory: rollbackPath }
        );

        knex.migrate.currentVersion()
            .asCallback((err, cv) => {

                if (err) {
                    return done(err);
                }

                if (cv !== 'none') {
                    return knex.migrate.rollback(config)
                        .asCallback((err) => {

                            return done(err);
                        });
                }

                done();
            });
    },

    rollbackDb: (session, rollbackPath, done) => {

        const { knex } = session;
        const config = Object.assign(
            {},
            session.options.knexConfig,
            { directory: rollbackPath }
        );

        knex.migrate.currentVersion()
            .asCallback((err, cv) => {

                if (err) {
                    return done(err);
                }

                if (cv !== 'none') {
                    return knex.migrate.rollback(config)
                        .asCallback((err) => {

                            if (err) {
                                return done(err);
                            }

                            module.exports.rollbackDb(session, rollbackPath, done);
                        });
                }
                done();
            });
    },

    getLatestMigration: (migrationDirPath) => {

        const migrationPathFiles = Fs.readdirSync(migrationDirPath);
        const latestMigration = migrationPathFiles[migrationPathFiles.length - 1];
        const latestMigrationPath = Path.resolve(migrationDirPath, latestMigration);
        return Fs.readFileSync(latestMigrationPath).toString('utf8');
    }
};
