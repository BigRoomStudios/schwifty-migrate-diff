'use strict';

const Fs = require('fs');
const Path = require('path');

module.exports = {

    getLatestMigration: (migrationDirPath) => {

        const migrationPathFiles = Fs.readdirSync(migrationDirPath);
        const latestMigration = migrationPathFiles[migrationPathFiles.length - 1];
        const latestMigrationPath = Path.resolve(migrationDirPath, latestMigration);
        return Fs.readFileSync(latestMigrationPath).toString('utf8');
    }
};
