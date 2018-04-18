'use strict';

const Os = require('os');
const Path = require('path');

module.exports = [
    {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
            filename: Path.join(Os.tmpdir(), 'schwifty_migrate_diff_test.db')
        }
    }, {
        client: 'mysql',
        connection: {
            host: '127.0.0.1',
            user: 'root',
            database: 'schwifty_migrate_diff_test'
        },
        pool: {
            afterCreate: (conn, cb) => {

                conn.query(`SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO'`, (err) => { // eslint-disable-line

                    cb(err, conn);
                });
            }
        }
    }, {
        client: 'postgres',
        connection: {
            host: '127.0.0.1',
            user: 'postgres',
            password: 'postgres',
            database: 'schwifty_migrate_diff_test'
        }
    }
];
