'use strict';

const KnexActions = require('./knexActions');
const Joi2KnexSchema = require('./joi2KnexSchema');
const MigrationAssistant = require('./migrationAssistant');
const JsonDiffpatch = require('jsondiffpatch');

const JsBeautify = require('js-beautify').js_beautify;
const Fs = require('fs');
const Hoek = require('hoek');
const Joi = require('joi');
const Path = require('path');
const Items = require('items');
const Package = require('../package.json');
const Schema = require('./schema');

const internals = {};

internals.migrationFileSuffix = 'schwifty_migration';

exports.register = (server, options, next) => {

    Joi.assert(options, Schema.plugin, 'Bad plugin options passed to schwifty-migration.');

    const userOptions = Hoek.shallow(options);

    server.ext('onPreStart', internals.initialize(userOptions), { after: 'schwifty' });

    return next();
};

exports.register.attributes = {
    pkg: Package,
    multiple: true
};

internals.initialize = (userOptions) => {

    return (server, next) => {

        const knexGroupsAsArray = [];

        Hoek.assert(server.root.realm.plugins.schwifty.collector.knexGroups, 'Need to have server.root.realm.plugins.schwifty.collector.knexGroups');

        const knexGroupsObj = server.root.realm.plugins.schwifty.collector.knexGroups;

        Object.keys(knexGroupsObj).forEach((key) => {

            knexGroupsAsArray.push(knexGroupsObj[key]);
        });

        // Save the knexGroupsAsArray to state for use elsewhere
        internals.state(server.root).knexGroupsAsArray = knexGroupsAsArray;

        // Handle the migrations directory
        const migrationsDir = userOptions.dir ? userOptions.dir + '/migrations' : Path.normalize(`${module.parent.parent.id}/../migrations`);

        if (!Fs.existsSync(migrationsDir)) {
            Fs.mkdirSync(migrationsDir, '0744');
        }

        // Used for writing to the migration file
        internals.state(server.root).migrationChanges = {
            upActions: [],
            downActions: []
        };

        internals.state(server.root).dbTableSchemas = { models: {}, joinTables: {} };
        const createModelTablesParams = [];

        knexGroupsAsArray.forEach((knexGroup) => {

            // console.log(knexGroup);
            // knexGroup
        });


        // console.log(userOptions);
        // console.log(internals.state(server.root));

        return next();

        models.forEach((model, i) => {

            // Convert Joi schema into knex columns
            let knexColumns;

            if (model.knexSchema) {
                knexColumns = model.knexSchema;
            }
            else {
                knexColumns = Joi2KnexSchema(model.schema);
            }

            delete knexColumns.id;

            internals.state(server).dbTableSchemas.models[model.tableName] = knexColumns;

            // Init models into tables if they don't already exist
            createModelTablesParams.push(['model', model.tableName, migrationChanges, knexInstance, knexColumns]);
        });

        Items.parallel(createModelTablesParams, (item, next) => {

            const args = item.concat([(err, res) => {

                next(err);
            }]);

            Function.prototype.apply(KnexActions.createTableIfNotExists, args);
        },
        (err) => {
            // cb when all items are done.
            if (err) {
                throw new Error(err);
            }

            const createJoinTablesParams = [];

            models.forEach((model, i) => {

                // Init join tables if they don't already exist
                // Needed to wait until after all model tables were created
                createJoinTablesParams.push([model, internals.state(server).dbTableSchemas.models[model.tableName], knexInstance, migrationChanges, server]);
            });

            Items.parallel(createJoinTablesParams, (item, nxt) => {

                const args = item.concat([(err, res) => {

                    nxt(err);
                }]);

                Function.prototype.apply(KnexActions.ensureJoinTableExists, args);
            },
            (err) => {

                internals.checkForSchemaChanges(server, migrationChanges, migrationsDir, knexInstance, (err, res) => {

                    if (err) {
                        throw new Error(err);
                    }

                    internals.makeMigrateFileIfNeeded(migrationChanges, knexInstance, migrationsDir, server, (err, success) => {

                        cb(err, success);
                    });
                });
            });
        });
    };
};

internals.ensureJoinTableExists = (model, knexColumns, knexInstance, migrationChanges, server, cb) => {

    const joinTables = {};

    if (model.relationMappings) {

        Object.keys(model.relationMappings).forEach((relationName) => {

            const relation = model.relationMappings[relationName];

            /*
                Does not yet support passing modelClass: as the `through` part.
                See here: http://vincit.github.io/objection.js/#models
                and search for 'modelClass: PersonMovie' for a comment mentioning it.
                At the time of this comment's writing, that's the only documentation for it. So yea
            */

            if (relation.join.through && relation.join.through.from && relation.join.through.to) {

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


                if (!joinTables[joinTableFromTableName]) {

                    joinTables[joinTableFromTableName] = {};

                    if (relationFrom[1] === 'id') {

                        joinTables[joinTableFromTableName][joinTableFromColumnName] = 'integer';

                    }
                    else {

                        Hoek.assert(relationOwnerKnexColumns[relationFromColumnName], `Model "${model.tableName}" does not have column "` + relationFrom[1] + '" specified in Joi schema. (Go see { relationMappings: { join: from|to }})');
                        joinTables[joinTableFromTableName][joinTableFromColumnName] = relationOwnerKnexColumns[relationFrom[1]];

                    }

                    if (relationTo[1] === 'id') {

                        joinTables[joinTableToTableName][joinTableToColumnName] = 'integer';

                    }
                    else {

                        Hoek.assert(relationParticipantKnexColumns[relationToColumnName], `Model "${model.tableName}" does not have column "` + relationTo[1] + '" specified in Joi schema. (Go see { relationMappings: { join: from|to }})');
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

            const args = item.concat([(err, res) => {

                next(err);
            }]);

            Function.prototype.apply(KnexActions.createTableIfNotExists, args);
        },
        (err) => {
            // cb when all items are done.
            if (err) {
                throw new Error(err);
            }

            return cb(null, true);
        });
    }

    return cb(null, true);
};

internals.getJsonDiffpatchChangeType = (change) => {

    if (!Array.isArray(change)) {
        return 'not a change';
    }

    switch (change.length) {

        case 1:

            // Additions only got 1 thing to say, I'm here yo!
            return 'create';
            break;

        case 2:

            return 'alter';
            break;

        case 3:

            // Just a lil extra validation before pulling the big trigger
            if (change[1] === 0 && change[2] === 0) {
                return 'drop';
            }

            /*
                This case only happens if an item moved indexes in an array.
                Won't ever happen based on how we're diffing
            */
            return 'index moved';

            break;

        default:

            return 'unknown';
            break;
    }
};


internals.checkForSchemaChanges = (server, migrationChanges, migrationsDir, knexInstance, cb) => {

    knexInstance.migrate.currentVersion({ directory: migrationsDir }).asCallback((err, res) => {

        console.log(res);

        if (res === 'none') {
            return cb(err, true);
        }

        Fs.readFile(`${migrationsDir}/${res}_${internals.migrationFileSuffix}.js`, 'utf8', (err, data) => {

            const startMarker = '/* Model Schemas--';
            const endMarker = '-- */';

            // This gets the json object of schemas in latest migration file
            const latestSchemas = JSON.parse(data.substring(data.indexOf(startMarker) + startMarker.length, data.indexOf(endMarker)));

            internals.state(server).latestSchemas = latestSchemas;
            const delta = JsonDiffpatch.diff(latestSchemas, internals.state(server).dbTableSchemas);

            if (!delta) {
                console.log('There were no changes');
                return cb(err, true);
            }

            const tableChanges = {};

            if (delta.models) {
                Object.keys(delta.models).forEach((tableName) => {

                    tableChanges[tableName] = delta.models[tableName];
                });
            }

            if (delta.joinTables) {
                Object.keys(delta.joinTables).forEach((tableName) => {

                    tableChanges[tableName] = delta.joinTables[tableName];
                });
            }

            internals.handleSchemaChanges(tableChanges, migrationChanges, knexInstance, internals.state(server).dbTableSchemas, latestSchemas, server, (err, schemaRes) => {

                return cb(err, schemaRes);
            });
        });
    });
};

internals.handleSchemaChanges = (tableChanges, migrationChanges, knexInstance, currentSchemas, latestSchemas, server, cb) => {

    console.log(tableChanges);

    const alter = { tables: [], columns: { name: {}, type: {} } };
    const create = { tables: [], columns: {} };
    const drop = { tables: [], columns: {} };

    Object.keys(tableChanges).forEach((tableName) => {

        const table = tableChanges[tableName];

        if (Array.isArray(table)) {

            // There are changes to the table itself if it's an array
            const tableChangeType = internals.getJsonDiffpatchChangeType(table);

            switch (tableChangeType) {

                // Create has already been taken care of.
                case 'drop':
                    drop.tables.push(tableName);
                    break;

                case 'create':
                    create.tables.push(tableName);
                    break;

                default:
                    throw new Error(`Unexpected migration state for table: ${tableName}. changeType: ${tableChangeType}, schema: ${tableChanges}`);
                    break;
            }
        }
        else {

            // There're changes to columns
            Object.keys(table).forEach((columnName) => {

                const columnChange = table[columnName];
                const columnChangeType = internals.getJsonDiffpatchChangeType(columnChange);

                const columnDesc = {};

                switch (columnChangeType) {

                    case 'create':
                        // Column added
                        if (!create.columns[tableName]) {
                            create.columns[tableName] = [];
                        }
                        columnDesc[columnName] = table[columnName][0];
                        create.columns[tableName].push(columnDesc);
                        break;

                    case 'alter':
                        // The column type has changed
                        if (!alter.columns.type[tableName]) {
                            alter.columns.type[tableName] = [];
                        }
                        columnDesc[columnName] = table[columnName];
                        alter.columns.type[tableName].push(columnDesc);
                        break;

                    case 'drop':
                        // Removed
                        if (!drop.columns[tableName]) {
                            drop.columns[tableName] = [];
                        }

                        columnDesc[columnName] = table[columnName][0];
                        drop.columns[tableName].push(columnDesc);
                        break;

                    default:
                        throw new Error(`Unexpected migration state for column: ${tableName} => ${columnName}. changeType: ${columnChangeType}, schema: ${tableChanges}`);
                        break;
                }
            });
        }
    });

    MigrationAssistant.askAboutAlters(tableChanges, drop, create, alter, (err, res) => {

        if (err) {
            return cb(err);
        }


        console.log('/////////////////////');

        console.log(JSON.stringify(res));
        console.log(internals.state(server).latestSchemas);

        console.log('drop', JSON.stringify(drop));
        console.log('alter', JSON.stringify(alter));
        console.log('create', JSON.stringify(create));

        console.log('/////////////////////');

        const knexActionParams = [];

        const tableAlters = {};

        Object.keys(res.drop.columns).forEach((tableName) => {

            if (!tableAlters[tableName]) {
                tableAlters[tableName] = { name: null, columns: [] };
            }

        });

        res.drop.tables.forEach((tableToDrop) => {

            knexActionParams.push('drop');
            // KnexActions.dropTableIfExists(tableType, tableName, migrationChanges, knexInstance, knexColumns, (err, res) => {

            // });
            console.log('AYYYYUYASDFASFASFASDF');
        });

        Items.parallel(knexActionParams, (item, next) => {

            const knexActionType = item.shift();

            switch (knexActionType) {

                case 'create':

                    break;

                case 'drop':

                    break;

                case 'alter':

                    break;
            }

            const args = item.concat([(err, res) => {

                next(err);
            }]);

            Function.prototype.apply(KnexActions.createTableIfNotExists, args);
        },
        (err) => {

            return cb(err, {
                drop: res.drop,
                create: res.create,
                alter: res.alter
            });

        });
    });
};


internals.makeMigrateFileIfNeeded = (migrationChanges, knexInstance, migrationsDir, server, cb) => {

    if (migrationChanges.upActions.length > 0 && migrationChanges.downActions.length > 0) {

        knexInstance.migrate.make(internals.migrationFileSuffix, { directory: migrationsDir })
        .asCallback((err, res) => {

            if (err) {
                return cb(err);
            }

            let migrationStr = `'use strict';\n\n/* Model Schemas--${JSON.stringify(internals.state(server).dbTableSchemas)}-- */`;

            migrationStr += '\n\nexports.up = function (knex, Promise) {\n\nreturn Promise.all([';

            migrationChanges.upActions.forEach((action, i) => {

                migrationStr += action;

                if (i >= migrationChanges.upActions.length - 1) {

                    migrationStr = migrationStr.slice(0,-1);
                }
            });

            migrationStr += ']);};\n\n';

            // Take it down
            migrationStr += 'exports.down = function (knex, Promise) {\n\nreturn Promise.all([\n';

            migrationChanges.downActions.forEach((action, i) => {

                migrationStr += action;

                if (i >= migrationChanges.downActions.length - 1) {

                    migrationStr = migrationStr.slice(0,-1);
                }
            });

            migrationStr += '\n]);};';

            const beautifyOptions = {
                end_with_newline: true,
                space_after_anon_function: true
            };

            Fs.writeFile(res, JsBeautify(migrationStr, beautifyOptions), (fsRes) => {

                return cb(null, res);
            });
        });
    }
    else {
        return cb(null, true);
    }
};

internals.state = (srv) => {

    const state = srv.realm.plugins.schwifty = srv.realm.plugins.schwifty || {};

    return state;
};
