'use strict';

const KnexBuilder = require('./knexBuilder');
const Joi2KnexSchema = require('./joi2KnexSchema');
const MigrationAssistant = require('./migrationAssistant');
const JsonDiffpatch = require('jsondiffpatch');

const JsBeautify = require('js-beautify').js_beautify;
const Fs = require('fs');
const Hoek = require('hoek');
const Joi = require('joi');
const Path = require('path');
const Items = require('items');
const Schema = require('./schema');

const Utils = require('./utils');

const internals = {
    tables: {
        modelTables: {
            tables: [],
            create: [],
            alter: [],
            delete: []
        },
        joinTables: {
            tables: [],
            create: [],
            alter: [],
            delete: []
        }
    },
    modelSchemas: {
        schemas: [],
        create: [],
        alter: [],
        delete: []
    }
};

exports.genMigrationFile = (server, options, next) => {

    Joi.assert(options, Schema.options, 'Bad options passed to schwifty-migration.');

    const userOptions = Hoek.shallow(options);
    const migrationGroups = userOptions.migrationGroups.map((mGroup) => {

        // Grabbed from Schwifty's migrator.js
        // Absolutize and normalize

        mGroup.migrationsDir = Path.isAbsolute(mGroup.migrationsDir) ?
            Path.normalize(mGroup.migrationsDir) :
            Path.join(process.cwd(), mGroup.migrationsDir);

        return mGroup;
    });


    const models = migrationGroups
        .reduce((collector, mGroup) => collector.concat(mGroup.models), []);


    // Grab join table info

    let joinTables = models.reduce((collector, model) => {

        // getJoinTableInfo returns an object with schema:
        // { tableName: 'tableName', joiSchema: Joi.object({...}) }

        return collector.concat(internals.getJoinTableInfo(model));

    }, [])
    .reduce((collector, joinTable) => {

        // Dedupe the joinTables -- multiple models can reference the same joinTable.
        // Models also may have different 'extras' in the relation when specifying the joinTable.
        // Here we'll consolidate those references to ensure the joinTables have all the
        // specified extras as columns

        if (!collector[joinTable.tableName]) {

            collector[joinTable.tableName] = {
                joiSchema: joinTable.joiSchema
            };
        }
        else {

            // Object.assign the joiSchema to the duplicate's schema

            collector[joinTable.tableName].joiSchema = Object.assign({}, collector[joinTable.tableName].joiSchema, joinTable.joiSchema);
        }

        return collector;

    }, {});


    // Change joinTables back to an array

    joinTables = Object.keys(joinTables).reduce((collector, key) => {

        collector.push({
            tableName: key,
            joiSchema: joinTables[key]
        });
        return collector;

    }, []);


    internals.diffTables(migrationGroups, joinTables, (err) => {

        if (err) {
            throw err;
        }

        return;

        internals.diffModels(joinTables);

        migrationGroups.forEach((mGroup) => {

            internals.diffModels(mGroup);

            next();
        });
    });

    // Items.serial(migrationGroups, (mGroup, next) => {

    //     internals.diffTables(mGroup, (err) => {

    //         next(err);
    //     });
    // },
    // (err) => {
};

internals.diffTables = (migrationGroups, joinTables, cb) => {

    // Diff the tables in the db with our models (including join tables via Objection's relationMappings)

    // This is until Knex gets the .listTables() function:
    // https://github.com/tgriesser/knex/issues/360

    // I grabbed this raw query from:
    // http://troels.arvin.dk/db/rdbms/#cli-list_of_tables

    const knexes = migrationGroups.reduce((collector, mGroup) => {

        if (collector.indexOf(mGroup.knex) === -1) {
            collector.push(mGroup.knex);
        }
        return collector;
    }, []);

    // For each knex, gather the models on that knex and check the tables

    Items.serial(knexes, (knex, next) => {

        // Gather the models for this knex

        const models = migrationGroups
            .reduce((collector, mGroup) => mGroup.knex === knex && collector.concat(mGroup.models), []);


        const getTablesCb = (dbTableNames) => {

            // Convert dbTableNames into an object for comparison using JsonDiffpatch

            dbTableNames = dbTableNames.reduce((collector, tableName) => {

                collector[tableName] = true;
                return collector;
            }, {});


            // Convert modelTableNames into an object for comparison using JsonDiffpatch

            const modelTableNames = models.map((model) => model.tableName)
            .reduce((collector, modelName) => {

                collector[modelName] = true;
                return collector;
            }, {});

            const joinTableNames = joinTables.map((joinTable) => joinTable.tableName)
            .reduce((collector, joinTableName) => {

                collector[joinTableName] = true;
                return collector;
            }, {});


            // Diff dbTableNames with modelTableNames.concat(joinTableNames)

            const changes = internals.diffJson(dbTableNames, Object.assign({}, modelTableNames, joinTableNames));

            console.log(changes);

            changes.create.forEach((tableToCreate) => {

                let createTableAction;

                if (Object.keys(modelTableNames).indexOf(tableToCreate) !== -1) {

                    // It is a model table
                    createTableAction = KnexBuilder.getTableCreateAction('model', {
                        tableName: tableToCreate,
                        columns
                    });
                }
                else {

                    // It must be a join table
                    createTableAction = KnexBuilder.getTableCreateAction('join');
                }

                // const dropTableAction = KnexBuilder.getTableDropAction();
                // Putting it in our list to give to the migration file builder
                internals.upActions.push(createTableAction);
                internals.downActions.push(dropTableAction);
            });

            changes.drop.forEach((tableToDrop) => {

            });
        };

        // Grab tablenames from various drivers

        switch (knex.client.driverName) {

            case 'mysql':
            case 'mysql2':

                const tables = [];

                knex.raw('SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE="BASE TABLE" AND TABLE_SCHEMA="' + knex.client.config.connection.database + '"')
                .then((res) => {

                    res = res[0].forEach((tableInfo) => {

                        tables.push(tableInfo.TABLE_NAME);
                    });
                    getTablesCb(tables);
                });
                break;

            case 'mariasql':
            case 'sqlite3':
            case 'pg':
            case 'oracle':
            default:
                throw new Error(`Can't yet get tables for "${knex.client.driverName}"`);
                break;
        }
    },
    (err) => {

        if (err) {
            //
        }

        cb(null);
    });
};

internals.diffModels = (migrationGroup) => {

    // Now let's diff our model schemas with what's in the db
    // - convert model schema to knex schema
    // - compile the derived knex schema using knex's columnCompiler for the db client
    // 'columnCompiler' contains the map from knex types to dialect column types per knex client

    migrationGroup.models.forEach((model) => {

        const modelKnexSchema = Joi2KnexSchema.convert(model.joiSchema);
        const tmpTableBuilder = migrationGroup.knex.client.tableBuilder('create', 'schemaMap', () => {});

        const modelKnex2DbSchema = Object.keys(modelKnexSchema).reduce((collector, columnName) => {

            // TODO add length logic here, requires coordination with the model's schema
            const tmpColumnBuilder = migrationGroup.knex.client.columnBuilder(tmpTableBuilder, modelKnexSchema[columnName], []);
            const tmpColumnCompiler = migrationGroup.knex.client.columnCompiler(tmpTableBuilder, tmpColumnBuilder);
            const columnType = tmpColumnCompiler.getColumnType();

            // Remove the output (255) specified lengths from varchar types.
            // At this time we only care about the column types
            collector[columnName] = columnType.split('(')[0];
            return collector;
        }, {});

        const modelPropChanges = {
            create: [],
            alter: [],
            drop: []
        };

        migrationGroup.knex.table(model.tableName).columnInfo()
        .then((dbSchema) => {

            Object.keys(dbSchema).forEach((columnName) => {

                const columnSchema = dbSchema[columnName].type;
                delete columnSchema.defaultValue;
                dbSchema[columnName] = columnSchema;
            });

            const delta = JsonDiffpatch.diff(dbSchema, modelKnex2DbSchema);

            if (delta) {

                console.log(`${model.tableName}:`);
                console.log(delta);

                Object.keys(delta).forEach((key) => {

                    // console.log(key);

                    switch (internals.getJsonDiffpatchChangeType(delta[key])) {

                        case 'create':
                            modelPropChanges.create.push(key);
                            break;
                        case 'alter':
                            modelPropChanges.alter.push(key);
                            break;
                        case 'drop':
                            modelPropChanges.drop.push(key);
                            break;
                    }
                });
            }

            console.log('//////////');
            console.log(modelPropChanges);

            if (modelPropChanges.create.length > 0) {
                //
            }

            if (modelPropChanges.alter.length > 0) {
                //
            }

            if (modelPropChanges.drop.length > 0) {
                //
            }
            return;
        });

        return;

        /*
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
        */
    });
};

internals.diffJson = (d1, d2) => {

    const changesByKey = {
        create: [],
        alter: [],
        drop: []
    };

    const delta = JsonDiffpatch.diff(d1, d2);

    if (delta) {

        Object.keys(delta).forEach((key) => {

            switch (internals.getJsonDiffpatchChangeType(delta[key])) {

                case 'create':
                    changesByKey.create.push(key);
                    break;
                case 'alter':
                    changesByKey.alter.push(key);
                    break;
                case 'drop':
                    changesByKey.drop.push(key);
                    break;
            }
        });
    }

    return changesByKey;
};


internals.getJoinTableInfo = (model) => {

    const joinTables = [];

    if (model.relationMappings) {

        Object.keys(model.relationMappings).forEach((relationName) => {

            const relation = model.relationMappings[relationName];

            if (!relation.join.through) {
                return;
            }

            // Does not yet support passing modelClass: as the `through` property.
            // See here:
            // http://vincit.github.io/objection.js/#models
            // and search for 'modelClass: PersonMovie' for a comment mentioning it.
            // At the time of this comment's writing, that's the only documentation for it.

            const relationFrom = relation.join.from.split('.');
            const relationTo = relation.join.to.split('.');

            const joinTableFrom = relation.join.through.from.split('.');
            const joinTableTo = relation.join.through.to.split('.');

            const relationExtra = relation.join.through.extra;

            if (relation.join.through.modelClass) {

                // A model is used for the join relationship
            }
            else {

                const joiSchema = Joi.object(relationExtra.reduce((collector, extra) => {

                    const extraSchema = {};
                    extraSchema[extra] = Joi.any();

                    return Object.assign({}, collector, extraSchema);
                }, {}));

                joinTables.push({
                    tableName: joinTableFrom[0],
                    joiSchema
                });
            }
        });

        return joinTables;
    }

    return [];
};

internals.getJsonDiffpatchChangeType = (change) => {

    if (!Array.isArray(change)) {
        return null;
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

            // Just a lil extra validation before saying it's a drop

            if (change[1] === 0 && change[2] === 0) {
                return 'drop';
            }

            // This case only happens if an item moved indexes in an array.
            // Won't ever happen based on how we're diffing

            return 'index moved';

            break;

        default:

            return 'unknown';
            break;
    }
};


// internals.runMigrations = (next) => {

//     // Handle the migrations directory, setting a default if one not provided
//     const migrationsDir = userOptions.migrationsDir ? userOptions.migrationsDir : Path.normalize(`${module.parent.parent.id}/../migrations`);

//     if (!Fs.existsSync(migrationsDir)) {
//         Fs.mkdirSync(migrationsDir, '0744');
//     }

//     // Used for writing to the migration file
//     internals.state(server.root).migrationChanges = {
//         upActions: [],
//         downActions: []
//     };

//     internals.state(server.root).dbTableSchemas = { models: {}, joinTables: {} };
//     const createModelTablesParams = [];

//     knexGroupsAsArray.forEach((knexGroup) => {

//         console.log(Object.keys(knexGroup));
//         // knexGroup
//     });

//     return next();

//     models.forEach((model, i) => {

//         // Convert Joi schema into knex columns
//         let knexColumns;

//         if (model.knexSchema) {
//             knexColumns = model.knexSchema;
//         }
//         else {
//             knexColumns = Joi2KnexSchema(model.schema);
//         }

//         delete knexColumns.id;

//         internals.state(server).dbTableSchemas.models[model.tableName] = knexColumns;

//         // Init models into tables if they don't already exist
//         createModelTablesParams.push(['model', model.tableName, migrationChanges, knexInstance, knexColumns]);
//     });

//     Items.parallel(createModelTablesParams, (item, next) => {

//         const args = item.concat([(err, res) => {

//             next(err);
//         }]);

//         Function.prototype.apply(KnexBuilder.createTableIfNotExists, args);
//     },
//     (err) => {
//         // cb when all items are done.
//         if (err) {
//             throw new Error(err);
//         }

//         const createJoinTablesParams = [];

//         models.forEach((model, i) => {

//             // Init join tables if they don't already exist
//             // Needed to wait until after all model tables were created
//             createJoinTablesParams.push([model, internals.state(server).dbTableSchemas.models[model.tableName], knexInstance, migrationChanges, server]);
//         });

//         Items.parallel(createJoinTablesParams, (item, nxt) => {

//             const args = item.concat([(err, res) => {

//                 nxt(err);
//             }]);

//             Function.prototype.apply(KnexBuilder.ensureJoinTableExists, args);
//         },
//         (err) => {

//             internals.checkForSchemaChanges(server, migrationChanges, migrationsDir, knexInstance, (err, res) => {

//                 if (err) {
//                     throw new Error(err);
//                 }

//                 internals.makeMigrateFileIfNeeded(migrationChanges, knexInstance, migrationsDir, server, (err, success) => {

//                     cb(err, success);
//                 });
//             });
//         });
//     });
// };

// internals.handleSchemaChanges = (tableChanges, migrationChanges, knexInstance, currentSchemas, latestSchemas, server, cb) => {

//     console.log(tableChanges);

//     const alter = { tables: [], columns: { name: {}, type: {} } };
//     const create = { tables: [], columns: {} };
//     const drop = { tables: [], columns: {} };

//     Object.keys(tableChanges).forEach((tableName) => {

//         const table = tableChanges[tableName];

//         if (Array.isArray(table)) {

//             // There are changes to the table itself if it's an array

//             const tableChangeType = internals.getJsonDiffpatchChangeType(table);

//             switch (tableChangeType) {

//                 // Create has already been taken care of.

//                 case 'drop':
//                     drop.tables.push(tableName);
//                     break;

//                 case 'create':
//                     create.tables.push(tableName);
//                     break;

//                 default:
//                     throw new Error(`Unexpected migration state for table: ${tableName}. changeType: ${tableChangeType}, schema: ${tableChanges}`);
//                     break;
//             }
//         }
//         else {

//             // There're changes to columns

//             Object.keys(table).forEach((columnName) => {

//                 const columnChange = table[columnName];
//                 const columnChangeType = internals.getJsonDiffpatchChangeType(columnChange);

//                 const columnDesc = {};

//                 switch (columnChangeType) {

//                     case 'create':

//                         // Column added

//                         if (!create.columns[tableName]) {
//                             create.columns[tableName] = [];
//                         }
//                         columnDesc[columnName] = table[columnName][0];
//                         create.columns[tableName].push(columnDesc);
//                         break;

//                     case 'alter':

//                         // The column type has changed

//                         if (!alter.columns.type[tableName]) {
//                             alter.columns.type[tableName] = [];
//                         }
//                         columnDesc[columnName] = table[columnName];
//                         alter.columns.type[tableName].push(columnDesc);
//                         break;

//                     case 'drop':

//                         // Removed

//                         if (!drop.columns[tableName]) {
//                             drop.columns[tableName] = [];
//                         }

//                         columnDesc[columnName] = table[columnName][0];
//                         drop.columns[tableName].push(columnDesc);
//                         break;

//                     default:
//                         throw new Error(`Unexpected migration state for column: ${tableName} => ${columnName}. changeType: ${columnChangeType}, schema: ${tableChanges}`);
//                         break;
//                 }
//             });
//         }
//     });

//     MigrationAssistant.askAboutAlters(tableChanges, drop, create, alter, (err, res) => {

//         if (err) {
//             return cb(err);
//         }


//         console.log('/////////////////////');

//         console.log(JSON.stringify(res));
//         console.log(internals.state(server).latestSchemas);

//         console.log('drop', JSON.stringify(drop));
//         console.log('alter', JSON.stringify(alter));
//         console.log('create', JSON.stringify(create));

//         console.log('/////////////////////');

//         const knexActionParams = [];

//         const tableAlters = {};

//         Object.keys(res.drop.columns).forEach((tableName) => {

//             if (!tableAlters[tableName]) {
//                 tableAlters[tableName] = { name: null, columns: [] };
//             }

//         });

//         res.drop.tables.forEach((tableToDrop) => {

//             knexActionParams.push('drop');
//             // KnexBuilder.dropTableIfExists(tableType, tableName, migrationChanges, knexInstance, knexColumns, (err, res) => {

//             // });
//             console.log('AYYYYUYASDFASFASFASDF');
//         });

//         Items.parallel(knexActionParams, (item, next) => {

//             const knexActionType = item.shift();

//             switch (knexActionType) {

//                 case 'create':

//                     break;

//                 case 'drop':

//                     break;

//                 case 'alter':

//                     break;
//             }

//             const args = item.concat([(err, res) => {

//                 next(err);
//             }]);

//             Function.prototype.apply(KnexBuilder.createTableIfNotExists, args);
//         },
//         (err) => {

//             return cb(err, {
//                 drop: res.drop,
//                 create: res.create,
//                 alter: res.alter
//             });

//         });
//     });
// };


// internals.makeMigrateFileIfNeeded = (migrationChanges, knexInstance, migrationsDir, server, cb) => {

//     if (migrationChanges.upActions.length > 0 && migrationChanges.downActions.length > 0) {

//         knexInstance.migrate.make({ directory: migrationsDir })
//         .asCallback((err, res) => {

//             if (err) {
//                 return cb(err);
//             }

//             let migrationStr = `'use strict';\n\n/* Model Schemas--${JSON.stringify(internals.state(server).dbTableSchemas)}-- */`;

//             migrationStr += '\n\nexports.up = function (knex, Promise) {\n\nreturn Promise.all([';

//             migrationChanges.upActions.forEach((action, i) => {

//                 migrationStr += action;

//                 if (i >= migrationChanges.upActions.length - 1) {

//                     migrationStr = migrationStr.slice(0,-1);
//                 }
//             });

//             migrationStr += ']);};\n\n';

//             // Take it down
//             migrationStr += 'exports.down = function (knex, Promise) {\n\nreturn Promise.all([\n';

//             migrationChanges.downActions.forEach((action, i) => {

//                 migrationStr += action;

//                 if (i >= migrationChanges.downActions.length - 1) {

//                     migrationStr = migrationStr.slice(0,-1);
//                 }
//             });

//             migrationStr += '\n]);};';

//             const beautifyOptions = {
//                 end_with_newline: true,
//                 space_after_anon_function: true
//             };

//             Fs.writeFile(res, JsBeautify(migrationStr, beautifyOptions), (fsRes) => {

//                 return cb(null, res);
//             });
//         });
//     }
//     else {
//         return cb(null, true);
//     }
// };
