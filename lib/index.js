
const Fs = require('fs');
const Hoek = require('hoek');
const Joi2KnexSchema = require('./joi2KnexSchema');
const Items = require('items');
const JsBeautify = require('js-beautify').js_beautify;
const Querystring = require('querystring');

const JsonDiffpatch = require('jsondiffpatch');

const internals = {};

const DiffJson = require('diff-json');

exports.initModels = (models, knexInstance, serverDir, server, cb) => {

    const migrationsDir = serverDir + '/migrations';

    internals.migrationFileSuffix = 'schwifty_migration';

    if (!Fs.existsSync(migrationsDir)) {
        Fs.mkdirSync(migrationsDir, 0744);
    }

    // Used for writing to the migration file
    const migrationChanges = {
        upActions: [],
        downActions: []
    }

    // Knex migrate to latest
    knexInstance.migrate.latest({ directory: migrationsDir });

    models = [].concat(models);

    internals.state(server).dbTableSchemas = { models: {}, joinTables: {} };
    const createModelTablesParams = [];

    models.forEach((model, i) => {

        // Convert Joi schema into knex columns
        let knexSchema;
        let knexColumns;

        if(model.knexSchema) {
            knexColumns = model.knexSchema;
        } else {
            knexColumns = Joi2KnexSchema(model.schema);
        }

        delete knexColumns.id;

        internals.state(server).dbTableSchemas.models[model.tableName] = knexColumns;

        // Init models into tables if they don't already exist
        createModelTablesParams.push(['model', model.tableName, migrationChanges, knexInstance, knexColumns]);
    });

    Items.parallel(createModelTablesParams, (item, next) => {

        internals.createTableIfNotExists(...item, (err, res) => {

            next(err);
        });
    },
    (err) => {
        // cb when all items are done.
        if(err) {
            throw new Error(err);
        }

        const createJoinTablesParams = [];

        models.forEach((model, i) => {

            // Init join tables if they don't already exist
            // Needed to wait until after all model tables were created
            createJoinTablesParams.push([model, internals.state(server).dbTableSchemas.models[model.tableName], knexInstance, migrationChanges, server]);
        });

        Items.parallel(createJoinTablesParams, (item, next) => {

            internals.ensureJoinTableExists(...item, (err, res) => {

                next(err);
            });
        },
        (err) => {

            internals.checkForSchemaChanges(server, migrationChanges, migrationsDir, knexInstance, (err, res) => {

                if(err) {
                    throw new Error(err);
                }

                internals.makeMigrateFileIfNeeded(migrationChanges, knexInstance, migrationsDir, server, (err, success) => {

                    if(success) {
                        cb(null, success);
                    }
                });
            });
        });
    })
}


internals.ensureJoinTableExists = (model, knexColumns, knexInstance, migrationChanges, server, cb) => {

    const joinTables = {};

    if(model.relationMappings) {

        Object.keys(model.relationMappings).forEach((relationName) => {

            const relation = model.relationMappings[relationName];

            /*
                Does not yet support passing modelClass: as the `through` part.
                See here: http://vincit.github.io/objection.js/#models
                and search for 'modelClass: PersonMovie' for a comment mentioning it.
                At the time of this comment's writing, that's the only documentation for it. So yea
            */

            if(relation.join.through && relation.join.through.from && relation.join.through.to) {

                const relationFrom = relation.join.from.split('.');
                const relationTo = relation.join.to.split('.');

                const joinTableFrom = relation.join.through.from.split('.');
                const joinTableTo = relation.join.through.to.split('.');

                const relationOwnerKnexColumns = knexColumns;
                const relationParticipantKnexColumns = internals.state(server).dbTableSchemas.models[relation.modelClass.tableName];


                const relationFromTableName = relationFrom[0];
                const relationFromColumnName = relationFrom[1];

                const joinTableFromTableName = joinTableFrom[0];
                const joinTableFromColumnName = joinTableFrom[1];


                const relationToTableName = relationTo[0];
                const relationToColumnName = relationTo[1];

                const joinTableToTableName = joinTableTo[0];
                const joinTableToColumnName = joinTableTo[1];


                if(!joinTables[joinTableFromTableName]) {

                    joinTables[joinTableFromTableName] = {};

                    if(relationFrom[1] === 'id') {

                        joinTables[joinTableFromTableName][joinTableFromColumnName] = 'integer';

                    } else {

                        Hoek.assert(relationOwnerKnexColumns[relationFromColumnName], `Model "${model.tableName}" does not have column "`+ relationFrom[1] +`" specified in Joi schema. (Go see { relationMappings: { join: from|to }})`);
                        joinTables[joinTableFromTableName][joinTableFromColumnName] = relationOwnerKnexColumns[relationFrom[1]];

                    }

                    if(relationTo[1] === 'id') {

                        joinTables[joinTableToTableName][joinTableToColumnName] = 'integer';

                    } else {

                        Hoek.assert(relationParticipantKnexColumns[relationToColumnName], `Model "${model.tableName}" does not have column "`+ relationTo[1] +`" specified in Joi schema. (Go see { relationMappings: { join: from|to }})`);
                        joinTables[joinTableToTableName][joinTableToColumnName] = relationParticipantKnexColumns[relationTo[1]];

                    }
                }
            }
        });


        internals.state(server).dbTableSchemas.joinTables = joinTables;

        const createJoinTablesParams = [];

        Object.keys(joinTables).forEach((key) => {

            createJoinTablesParams.push(['join', key, migrationChanges, knexInstance, joinTables[key]]);
        });

        Items.parallel(createJoinTablesParams, (item, next) => {

            internals.createTableIfNotExists(...item, (err, res) => {

                next(err);
            });
        },
        (err) => {
            // cb when all items are done.
            if(err) {
                throw new Error(err);
            }

            cb(null, true);
        });
    }
}

internals.createTableIfNotExists = (tableType, tableName, migrationChanges, knexInstance, knexColumns, cb) => {

    knexInstance.schema.hasTable(tableName).asCallback((err, exists) => {

        if(err) {
            return cb(err);
        }

        if(!exists) {

            const knexDbSchema = knexInstance.schema.createTable(tableName, function (table) {

                const colNames = Object.keys(knexColumns);

                if(tableType === 'model') {
                    table.increments('id').unsigned().primary();
                }

                table.timestamps();

                Object.keys(knexColumns).forEach((colName) => {

                    table[knexColumns[colName]](colName);
                });

                /*
                    Migration Changes here
                */
                let createTableUpAction = `\nknex.schema.createTableIfNotExists('${tableName}', function (table) {\n\n`;

                if(tableType === 'model') {
                    createTableUpAction += `table.increments('id').unsigned().primary();`;
                }

                createTableUpAction += 'table.timestamps();'

                Object.keys(knexColumns).forEach((colName) => {

                    createTableUpAction += 'table';
                    createTableUpAction += (`.` + knexColumns[colName] + `('` +colName + `');`);
                });

                createTableUpAction += `}),`;

                migrationChanges.upActions.push(createTableUpAction);

                migrationChanges.downActions.push(`\nknex.schema.dropTableIfExists('${tableName}'),`);

                return cb(null, true);

            }).catch((err) => {

                return cb(err);
            });
        } else {
            return cb(null, true);
        }
    })
    .catch((err) => {

        return cb(err);
    });
}

internals.checkForSchemaChanges = (server, migrationChanges, migrationsDir, knexInstance, cb) => {

    knexInstance.migrate.currentVersion({ directory: migrationsDir }).asCallback((err, res) => {

        if(res === 'none') {
            return cb(null, true);
        }

        Fs.readFile(`${migrationsDir}/${res}_${internals.migrationFileSuffix}.js`, 'utf8', (err, data) => {

            const startMarker = '/* Model Schemas--';
            const endMarker = '-- */';

            // This gets the json object of schemas in latest migration file
            const latestSchemas = data.substring(data.indexOf(startMarker) + startMarker.length, data.indexOf(endMarker));

            let delta = JsonDiffpatch.diff(JSON.parse(latestSchemas), internals.state(server).dbTableSchemas);

            console.log(JSON.stringify(delta));
            console.log(JsonDiffpatch.diff({one: ['a','bxyz','c']}, {one: ['a','b','c']}));

            return cb(null, true);
        });
    });
}

internals.makeMigrateFileIfNeeded = (migrationChanges, knexInstance, migrationsDir, server, cb) => {

    if(migrationChanges.upActions.length > 0 && migrationChanges.downActions.length > 0) {

        knexInstance.migrate.make(internals.migrationFileSuffix, { directory: migrationsDir })
        .asCallback((err, res) => {

            if(err) {
                return cb(err);
            }

            let migrationStr = `'use strict';\n\n/* Model Schemas--${JSON.stringify(internals.state(server).dbTableSchemas)}-- */`;

            migrationStr += `\n\nexports.up = function (knex, Promise) {\n\nreturn Promise.all([`;

            migrationChanges.upActions.forEach((action, i) => {

                migrationStr += action;

                if(i >= migrationChanges.upActions.length - 1) {

                    migrationStr = migrationStr.slice(0,-1);
                }
            });

            migrationStr +=`]);};\n\n`;

            // Take it down
            migrationStr += `exports.down = function (knex, Promise) {\n\nreturn Promise.all([\n`;

            migrationChanges.downActions.forEach((action, i) => {

                migrationStr += action;

                if(i >= migrationChanges.downActions.length - 1) {

                    migrationStr = migrationStr.slice(0,-1);
                }
            });

            migrationStr += `\n]);};`;

            const beautifyOptions = {
                end_with_newline: true,
                space_after_anon_function: true
            }

            Fs.writeFile(res, JsBeautify(migrationStr, beautifyOptions), (fsRes) => {

                return cb(null, res);
            });
        })
    } else {
        return cb(null, true);
    }
}

internals.state = (srv) => {

    const state = srv.realm.plugins.schwiftyMigration = srv.realm.plugins.schwiftyMigration || {};

    return state;
};
