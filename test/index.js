'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Path = require('path');
const Fs = require('fs');
const Knex = require('knex');
const Items = require('items');
const Hapi = require('hapi');
const Hoek = require('hoek');
const ModelsFixture = require('./models');
const Glue = require('glue');
const Joi = require('joi');

const Schwifty = require('schwifty');
const SchwiftyMigration = require('..');

const SchwiftyModel = require('schwifty').Model;

const Joi2KNexSchema = require(Path.normalize(`${__dirname}/../lib/joi2KNexSchema`));


// Test shortcuts

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

describe('SchwiftyMigration', () => {

    const setup = () => {

        if (Fs.existsSync(Path.normalize(`${__dirname}/migrations`))) {
            Fs.rmdirSync(Path.normalize(`${__dirname}/migrations`));
        }

        if (Fs.existsSync(Path.normalize(`${__dirname}/subDir/migrations`))) {
            Fs.rmdirSync(Path.normalize(`${__dirname}/subDir/migrations`));
        }
    };

    const teardown = () => {

    };

    const getSchwiftyOptions = (includeModels, fileDbName) => {

        if (fileDbName) {
            fileDbName = Path.normalize('./test/' + fileDbName);
        }

        const options = JSON.parse(JSON.stringify({

            knexConfig: {
                client: 'sqlite3',
                connection: {
                    filename: fileDbName ? fileDbName : ':memory:'
                },
                useNullAsDefault: true
            }
        }));

        if (includeModels) {
            options.models = ModelsFixture;
        }

        return options;
    };

    const getSchwiftyMigrationOptions = (mode) => {

        return {
            dir: __dirname,
            mode: mode ? mode : 'create'
        };
    };

    const getServer = (pluginOptions, cb) => {

        if (typeof pluginOptions === 'function') {
            cb = pluginOptions;
            pluginOptions = {
                schwiftyOptions: getSchwiftyOptions(),
                schwiftyMigrationOptions: getSchwiftyMigrationOptions()
            };
        }

        if (!pluginOptions.schwiftyOptions) {
            pluginOptions.schwiftyOptions = getSchwiftyOptions();
        }

        if (!pluginOptions.schwiftyMigrationOptions) {
            pluginOptions.schwiftyMigrationOptions = getSchwiftyMigrationOptions();
        }


        const server = new Hapi.Server();
        server.connection();

        Items.parallel([{
            register: Schwifty,
            options: pluginOptions.schwiftyOptions
        },
        {
            register: SchwiftyMigration,
            options: pluginOptions.schwiftyMigrationOptions
        }],
        (item, next) => {

            server.register(item, next);
        },
        (err) => {

            // Complete
            expect(err).to.not.exist();
            return cb(null, server);
        });

        // server.register({
        //     register: Schwifty,
        //     options
        // }, (err) => {

        //     if (err) {
        //         return cb(err);
        //     }

        //     return cb(null, server);
        // });

        // Glue.compose({
        //     connections: [
        //         {
        //             host: '0.0.0.0',
        //             port: process.env.PORT || 3000,
        //             labels: 'test'
        //         }
        //     ],
        //     registrations: [
        //         {
        //             plugin: {
        //                 register: 'schwifty',
        //                 options: pluginOptions.schwiftyOptions
        //             }
        //         },
        //         {
        //             plugin: {
        //                 register: '..',
        //                 options: pluginOptions.schwiftyMigrationOptions
        //             }
        //         }
        //     ]
        // }, { relativeTo: __dirname },
        // (err, server) => {

        //     // DRY so I don't have to keep checking for this error
        //     Hoek.assert(!err, err);
        //     cb(err, server);
        // });

    };


    const state = (server) => {

        return server.realm.plugins.schwifty;
    };

    // Run setup before tests
    setup();




    // describe('plugin registration', () => {

    //     // it('throws on invalid plugin options passed', (done) => {

    //     //     const schwiftyMigrationOptions = getSchwiftyMigrationOptions();

    //     //     schwiftyMigrationOptions.illegalProp = 'Im here';

    //     //     expect(() => {

    //     //         getServer({ schwiftyMigrationOptions }, (err, server) => {

    //     //             console.log("THE ERROR IS " + err);
    //     //             return done(new Error('Should not make it here.'));
    //     //         });
    //     //     }).to.throw(/Bad plugin options passed to schwifty-migration/);

    //     //     done();
    //     // });

    //     it('creates a migration directory in specified dir if none exists', (done) => {

    //         expect(Fs.existsSync(Path.normalize(`${__dirname}/migrations`))).to.equal(false);
    //         expect(Fs.existsSync(Path.normalize(`${__dirname}/subDir/migrations`))).to.equal(false);

    //         const schwiftyMigrationOptions = getSchwiftyMigrationOptions();
    //         schwiftyMigrationOptions.dir = Path.normalize(`${__dirname}/subDir`);

    //         getServer({ schwiftyMigrationOptions }, (err, server) => {

    //             expect(err).to.not.exist();
    //             server.initialize((err) => {

    //                 expect(err).to.not.exist();
    //                 expect(Fs.existsSync(Path.normalize(`${__dirname}/subDir/migrations`))).to.equal(true);
    //                 done();
    //             });
    //         });
    //     });

    //     it('creates a migration directory in current dir if none exists and none specified', (done) => {

    //         expect(Fs.existsSync(Path.normalize(`${__dirname}/migrations`))).to.equal(false);

    //         const schwiftyMigrationOptions = getSchwiftyMigrationOptions();
    //         delete schwiftyMigrationOptions.dir;

    //         getServer({ schwiftyMigrationOptions }, (err, server) => {

    //             expect(err).to.not.exist();
    //             server.initialize((err) => {

    //                 expect(err).to.not.exist();
    //                 expect(Fs.existsSync(Path.normalize(`${__dirname}/migrations`))).to.equal(true);
    //                 done();
    //             });
    //         });
    //     });
    // });


    describe('Joi2KNexSchema', () => {

        it('converts to knex schema for all supported Joi types', (done) => {

            // class fullJoi extends SchwiftyModel {

            //     static get tableName() {

            //         return 'fullJoi';
            //     }

            //     static get schema() {

            //         return Joi.object({
            //             str: Joi.string(),
            //             bool: Joi.boolean(),
            //             date: Joi.date(),
            //             binary: Joi.binary(),
            //             number: Joi.number(),
            //             arr: Joi.array(),
            //             obj: Joi.object(),
            //             any: Joi.any()
            //         });
            //     }
            // }

            const schwiftyOptions = getSchwiftyOptions();
            // schwiftyOptions.models = [fullJoi];

            getServer({ schwiftyOptions }, (err, server) => {

                expect(err).to.not.exist();
                server.initialize((err) => {

                    expect(err).to.not.exist();

                    // console.log(state(server.root));
                    expect(state(server.root).dbTableSchemas).to.exist();

                    done();
                });
            });

            // const joiSchema = Joi.object({
            //     str: Joi.string(),
            //     bool: Joi.boolean(),
            //     date: Joi.date(),
            //     binary: Joi.binary(),
            //     number: Joi.number(),
            //     arr: Joi.array(),
            //     obj: Joi.object(),
            //     any: Joi.any()
            // });

            // expect(Joi2KNexSchema(joiSchema)).to.equal({ str: 'string',
            //     bool: 'boolean',
            //     date: 'date',
            //     binary: 'binary',
            //     number: 'integer',
            //     arr: 'json',
            //     obj: 'json',
            //     any: 'string'
            // });

            // done();
        });

        // it('converts to knex schema for all supported Joi types', (done) => {

        //     const joiSchema = Joi.object({
        //         str: Joi.string(),
        //         bool: Joi.boolean(),
        //         date: Joi.date(),
        //         binary: Joi.binary(),
        //         number: Joi.number(),
        //         arr: Joi.array(),
        //         obj: Joi.object(),
        //         any: Joi.any()
        //     });

        //     expect(Joi2KNexSchema(joiSchema)).to.equal({ str: 'string',
        //         bool: 'boolean',
        //         date: 'date',
        //         binary: 'binary',
        //         number: 'integer',
        //         arr: 'json',
        //         obj: 'json',
        //         any: 'string'
        //     });

        //     done();
        // });

        // it('throws if unsupported Joi type is passed in', (done) => {

        //     const joiSchema = Joi.object({
        //         alternate: Joi.alternatives([
        //             Joi.string(),
        //             Joi.number()
        //         ])
        //     });

        //     expect(() => {

        //         Joi2KNexSchema(joiSchema);
        //     }).to.throw(/Schema type alternatives not supported/);

        //     done();
        // });
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
