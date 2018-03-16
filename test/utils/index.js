'use strict';

const Fs = require('fs');
const Path = require('path');

module.exports = {

    rollbackDbOnce: (session, rollbackPath, next) => {

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

                            next();
                        })
                        .catch(next);
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
            .then((cv) => {

                if (cv !== 'none') {
                    return knex.migrate.rollback(config)
                        .then(() => {

                            module.exports.rollbackDb(session, rollbackPath, next);
                        })
                        .catch(next);
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
