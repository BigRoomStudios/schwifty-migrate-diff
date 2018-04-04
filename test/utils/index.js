'use strict';

const Fs = require('fs');
const Path = require('path');

module.exports = {

    compareOutput: (output, expectedOutput) => {

        if (output.code !== expectedOutput.code) {
            return false;
        }

        if (String(output.skippedCols) !== String(expectedOutput.skippedCols)) {
            return false;
        }

        // Just check if this is truthy or not -- we don't know the timestamp
        // Knex is going to assign to the filename
        if (Boolean(output.file) !== Boolean(expectedOutput.file)) {
            return false;
        }

        return true;
    },

    rollbackDbOnce: (session, rollbackPath, next) => {

        const { knex } = session;
        const config = Object.assign(
            {},
            session.options.knexConfig,
            { directory: rollbackPath }
        );

        knex.migrate.currentVersion()
            .asCallback((err, cv) => {

                if (err) {
                    return next(err);
                }

                if (cv !== 'none') {
                    return knex.migrate.rollback(config)
                        .asCallback((err) => {

                            return next(err);
                        });
                }

                next();
            });
    },

    rollbackDb: (session, rollbackPath, next) => {

        const { knex } = session;
        const config = Object.assign(
            {},
            session.options.knexConfig,
            { directory: rollbackPath }
        );

        knex.migrate.currentVersion()
            .asCallback((err, cv) => {

                if (err) {
                    return next(err);
                }

                if (cv !== 'none') {
                    return knex.migrate.rollback(config)
                        .asCallback((err) => {

                            if (err) {
                                return next(err);
                            }

                            module.exports.rollbackDb(session, rollbackPath, next);
                        });
                }
                next();
            });
    },

    getLatestMigration: (migrationDirPath) => {

        const migrationPathFiles = Fs.readdirSync(migrationDirPath);
        const latestMigration = migrationPathFiles[migrationPathFiles.length - 1];
        const latestMigrationPath = Path.resolve(migrationDirPath, latestMigration);
        return Fs.readFileSync(latestMigrationPath).toString('utf8');
    }
};
