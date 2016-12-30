'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Path = require('path');
const Fs = require('fs');
const Knex = require('knex');
const Items = require('items');
const Hoek = require('hoek');
const ModelsFixture = require('./models');
const SchwiftyMigration = require('..');
const Glue = require('glue');


// Test shortcuts

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

describe('SchwiftyMigration', () => {

    const setup = () => {

        if (Fs.existsSync(migrationsDir)) {
            Fs.rmdirSync(migrationsDir);
        }
    };

    const teardown = () => {

    };


    const getSchwiftyOptions = (fileDbName) => {

        if (fileDbName) {
            fileDbName = Path.normalize('./test/' + fileDbName);
        }

        return JSON.parse(JSON.stringify({

            knexConfig: {
                client: 'sqlite3',
                connection: {
                    filename: fileDbName ? fileDbName : ':memory:'
                },
                useNullAsDefault: true
            }
        }));
    };

    const getSchwiftyMigrationOptions = () => {

        return {
            dir: Path.normalize(`${__dirname}/../lib`),
            mode: 'create'
        }
    };

    const getOptions = (includeModels, fileDbName) => {

        const options = schwiftyOptions();

        if (includeModels) {
            options.models = ModelsFixture;
        }

        return options;
    };

    const getServer = (pluginOptions, cb) => {

        if (typeof pluginOptions === 'function') {
            cb = pluginOptions;
            pluginOptions = {
                schwiftyOptions: getSchwiftyOptions(),
                schwiftyMigrationOptions: getSchwiftyMigrationOptions()
            }
        }

        if (!pluginOptions.schwiftyOptions) {
            pluginOptions.schwiftyOptions = getSchwiftyOptions();
        }

        if (!pluginOptions.schwiftyMigrationOptions) {
            pluginOptions.schwiftyMigrationOptions = getSchwiftyMigrationOptions();
        }

        Glue.compose({
            connections: [
                {
                    host: '0.0.0.0',
                    port: process.env.PORT || 3000,
                    labels: 'test'
                }
            ],
            registrations: [
                {
                    plugin: {
                        register: 'schwifty',
                        options: pluginOptions.schwiftyOptions
                    }
                },
                {
                    plugin: {
                        register: '..',
                        options: pluginOptions.schwiftyMigrationOptions
                    }
                },
            ]
        }, { relativeTo: __dirname },
        (err, server) => {

            // DRY so I don't have to keep checking for this error
            Hoek.assert(!err, err);
            cb(err, server);
        });
    };


    const state = (server) => {

        return server.realm.plugins.schwiftyMigration;
    };

    // Run setup before tests
    setup();

    it('throws on invalid plugin options passed', (done) => {

        getServer((err, server) => {

            expect(err).not.to.exist();
            done();
        });
    });

    it('creates a migration directory if none exists', (done) => {

        getServer((err, server) => {

            expect(err).not.to.exist();
            done();
        });
    });



    teardown();
});




/*it('throws when `migration` options are specified more than once.', (done) => {

    const options = getOptions();
    options.migration = {
        dir: Path.normalize('./'),
        mode: 'create'
    };

    getServer(options, (err, server) => {

        expect(err).to.not.exist();

        const plugin = (srv, opts, next) => {

            srv.register({ options, register: Schwifty }, next);
        };

        plugin.attributes = { name: 'my-plugin' };

        expect(() => {

            server.register(plugin, () => done('Should not make it here.'));
        }).to.throw('Schwifty\'s migration options can only be specified once.');

        done();
    });
});*/
