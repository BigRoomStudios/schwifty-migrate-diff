'use strict';

const Os = require('os');
const Path = require('path');

module.exports = [
    {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
            filename: Path.join(Os.tmpdir(), 'schwifty_migration_test.db')
        }
    }, {
        client: 'mysql',
        connection: {
            host: '127.0.0.1',
            user: 'root',
            database: 'schwifty_migration_test'
        },
        pool: {
            min: 0,
            max: 50,
            afterCreate: (conn, cb) => {

                conn.query(`SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO'`, (err) => { // eslint-disable-line

                    cb(err, conn);
                });
            }
        }
    }, {
        client: 'postgres',
        pool: {
            min: 0,
            max: 50
        },
        connection: {
            host: '127.0.0.1',
            user: 'postgres',
            password: 'postgres',
            database: 'schwifty_migration_test'
        }
    }
];
