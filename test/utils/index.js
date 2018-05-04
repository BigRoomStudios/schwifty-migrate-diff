'use strict';

const Fs = require('fs');
const Path = require('path');
const Promise = require('bluebird');

module.exports = {

    validateOutput: (output, expectedOutput) => {

        if (output.code !== expectedOutput.code) {
            return false;
        }

        if (String(output.skippedColumns) !== String(expectedOutput.skippedColumns)) {
            return false;
        }

        // Just check if this is truthy or not -- we don't know the timestamp
        // Knex is going to assign to the filename
        if (Boolean(output.file) !== Boolean(expectedOutput.file)) {
            return false;
        }

        return true;
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
