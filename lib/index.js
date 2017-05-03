'use strict';

const Joi2KnexSchema = require('./joi2KnexSchema');
const JsonDiffpatch = require('jsondiffpatch');

const Hoek = require('hoek');
const Joi = require('joi');
const Path = require('path');
const Items = require('items');
const Schema = require('./schema');

const internals = {};

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

    let models = migrationGroups
        .reduce((collector, mGroup) => collector.concat(mGroup.models), []);


    // Grab join table info

    const joinTables = models.reduce((collector, model) => {

        // internals.getJoinTableInfo returns an object with schema:
        // { tableName: 'tableName', joiSchema: Joi.object({...}) }

        // The joiSchema referenced above includes ['extras']
        // defined in relationshipMappings. By default they're set to Joi.any()

        return collector.concat(internals.getJoinTableInfo(model));

    }, [])
    .reduce((collector, joinTable) => {

        // Dedupe the joinTables -- multiple models can reference the same joinTable,
        // so we might have more than one entry for the same join table
        // across different models.

        if (!collector[joinTable.tableName]) {

            collector[joinTable.tableName] = {
                joiSchema: joinTable.joiSchema,
                knexSchema: Joi2KnexSchema.convert(joinTable.joiSchema)
            };
        }
        else {

            // We've already stored this joinTable in the collector. So let's
            // merge the schemas of that one and this one

            // Object.assign the joiSchema and knexSchemas

            collector[joinTable.tableName].joiSchema = Object.assign({},
                collector[joinTable.tableName].joiSchema, joinTable.joiSchema
            );

            collector[joinTable.tableName].knexSchema = Object.assign({},
                collector[joinTable.tableName].knexSchema, Joi2KnexSchema.convert(joinTable.joiSchema)
            );
        }

        return collector;

    }, {});


    // Prepare models for going into internals.allTables
    // See the internals.allTables schema in a comment the top of the file

    models = models.reduce((collector, model) => {

        collector[model.tableName] = {
            joiSchema: model.joiSchema,
            knexSchema: Joi2KnexSchema.convert(model.joiSchema)
        };

        return collector;

    }, {});


    // Create tables collector, allTables

    const allTables = Object.assign({}, joinTables, models);

    internals.diffTables(migrationGroups, joinTables, allTables, (err, knexTableDeltas) => {

        if (err) {
            throw err;
        }

        console.log(JSON.stringify(knexTableDeltas, undefined, 4));

        return;

        internals.diffColumns(migrationGroups, joinTables, (err, knexColumnDeltas) => {

        });
    });
};

internals.dedupeKnexes = (migrationGroups) => {

    return migrationGroups.reduce((collector, mGroup) => {

        if (collector.indexOf(mGroup.knex) === -1) {
            collector.push(mGroup.knex);
        }
        return collector;
    }, []);
};

internals.getModelsForKnex = (migrationGroups, knex, allTables) => {

    return migrationGroups
    .reduce((collector, mGroup) => mGroup.knex === knex && collector.concat(mGroup.models), [])
    .reduce((collector, model) => {

        collector[model.tableName] = allTables[model.tableName];
        return collector;
    }, {});
}

internals.diffTables = (migrationGroups, joinTables, allTables, cb) => {

    // Diff the tables in the db with our models and joinTables

    const knexes = internals.dedupeKnexes(migrationGroups);

    // For each knex, gather the models on that knex and check the tables
    // This allows us to handle migrations on multiple knex instances!

    const knexTableDeltas = [];

    Items.parallel(knexes, (knex, next) => {

        // Gather the models for this knex

        const models = internals.getModelsForKnex(migrationGroups, knex, allTables);

        const knexTableDeltaObject = {
            knex,
            tableDelta: { create: [] },
            joinTableDelta: { create: [] }
        };

        Items.parallel(Object.keys(allTables), (tableName, next) => {

          // Ping the db for existence of each table

          knex(tableName).select(knex.raw('1')).asCallback((err) => {

            if (err) {

                if (Object.keys(joinTables).indexOf(tableName) !== -1) {

                    knexTableDeltaObject.joinTableDelta.create.push(tableName);
                }
                else {
                  knexTableDeltaObject.tableDelta.create.push(tableName);
                }
            }

            next();
          });
        },
        (err) => {

          knexTableDeltas.push(knexTableDeltaObject);
          next(null);
        });
    },
    (err) => {

        if (err) {
            throw new Error(err);
        }

        cb(null, knexTableDeltas);
    });
};

internals.diffColumns = (migrationGroups, joinTables, knexDeltas) => {

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

            const joinTableFrom = relation.join.through.from.split('.');
            const relationExtra = relation.join.through.extra;

            if (relation.join.through.modelClass) {

                // A model is used for the join relationship
                throw new Error('schwifty-migration does not yet support modelClass in the "through" relationshipMapping property');
            }
            else {

                const joiSchema = Joi.object(relationExtra.reduce((collector, extra) => {

                    // Here, setting the default type for extras defined in
                    // relationMappings to be Joi.any();

                    const extraSchema = {};
                    extraSchema[extra] = Joi.any();

                    return Object.assign({}, collector, extraSchema);
                }, {}));

                joinTables.push({
                    tableName: joinTableFrom[0], // TODO: Check how objection does this check
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
