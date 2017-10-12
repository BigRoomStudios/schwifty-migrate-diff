'use strict';

const JsonDiffpatch = require('jsondiffpatch');
const Hoek = require('hoek');
const Joi = require('joi');
const Path = require('path');
const Items = require('items');
const Schema = require('./schema');
const Handlebars = require('handlebars');
const Fs = require('fs');

const { convertFuncs: { joi2Knex, db2ColumnCompiler, db2Knex }, ignoreColumns } = require('./mappings');

const internals = {};

exports.genMigrationFile = (options, schwiftyMigrationNext) => {

    internals.schwiftyMigrationNext = schwiftyMigrationNext;

    Joi.assert(options, Schema.options, 'Bad options passed to schwifty-migration.');

    if (options.models.length === 0) {
        return schwiftyMigrationNext();
    }

    const userOptions = Hoek.shallow(options);
    const { models, migrationsDir, knex } = userOptions;

    const migrationGroup = { models, migrationsDir, knex };

    // Grabbed from Schwifty's migrator.js
    // Absolutize and normalize

    migrationGroup.migrationsDir = Path.isAbsolute(migrationGroup.migrationsDir) ?
        Path.normalize(migrationGroup.migrationsDir) :
        Path.join(process.cwd(), migrationGroup.migrationsDir);

    // Grab join table info

    const joinTables = migrationGroup.models.reduce((collector, model) => {

        // The joiSchema referenced above includes ['extras']
        // defined in relationshipMappings. By default they're set to Joi.any()

        // internals.getJoinTableInfo returns an object with schema:
        // { tableName: 'tableName', joiSchema: Joi.object({...}) }

        return collector.concat(internals.getJoinTableInfo(model));

    }, [])
    .reduce((collector, joinTable) => {

        // Dedupe the joinTables -- multiple models can reference the same joinTable,
        // so we might have more than one entry for the same join table
        // across different models.

        const { tableName, joiSchema } = joinTable;

        if (!collector[tableName]) {

            collector[tableName] = {
                joiSchema,
                knexSchema: joi2Knex(joiSchema)
            };
        }
        else {

            // We've already stored this joinTable in the collector. So let's
            // merge the schemas of that one and this one

            // This way you can specify an array of extras in one model's relation and
            // a different set of extras on a different model

            // Object.assign the joiSchema and knexSchemas

            collector[tableName].joiSchema = Object.assign(
                {},
                collector[tableName].joiSchema,
                joiSchema
            );

            collector[tableName].knexSchema = Object.assign(
                {},
                collector[tableName].knexSchema,
                joi2Knex(joiSchema)
            );
        }

        return collector;

    }, {});

    const regularTables = migrationGroup.models.reduce((collector, model) => {

        collector[model.tableName] = {
            joiSchema: model.joiSchema,
            knexSchema: joi2Knex(model.joiSchema)
        };

        return collector;

    }, {});

    // Create tables collector, allTables

    const allTables = Object.assign({}, joinTables, regularTables);

    internals.diffTables(migrationGroup, joinTables, allTables, (_tableErr, tableDeltas) => {

        internals.diffColumns(migrationGroup, (_columnsErr, columnDeltas) => {

            // All finished diffing, time to make a migration file

            // Handlebars helpers

            Handlebars.registerHelper('someObjectPropsHaveValue', (obj) => {

                return Object.keys(obj).some((objKey) => {

                    const currentProp = obj[objKey];

                    if (Array.isArray(currentProp)) {
                        return currentProp.length !== 0;
                    }
                    else if (typeof currentProp === 'object') {

                        return Object.keys(currentProp).length !== 0;
                    }
                });
            });

            Handlebars.registerHelper('itemNotInArray', (item, arr) => {

                return arr.indexOf(item) === -1;
            });

            Handlebars.registerHelper('keyFromObject', (key, obj) => {

                return obj[key];
            });

            Handlebars.registerHelper('indexFromArray', (index, arr) => {

                return arr[index];
            });

            Handlebars.registerHelper('objectKeys', (obj) => {

                return Object.keys(obj);
            });

            Fs.readdirSync(`${__dirname}/hbs/partials/`)
            .forEach((fileName) => {

                Handlebars.registerPartial(
                    fileName.split('.hbs')[0],
                    String(Fs.readFileSync(`${__dirname}/hbs/partials/${fileName}`))
                );
            });

            const compiler = Handlebars.compile(String(Fs.readFileSync(__dirname + '/hbs/migrationFileTemplate.hbs')));
            const createdTables = tableDeltas.tableDelta.create.concat(tableDeltas.joinTableDelta.create);

            if (createdTables.length === 0 &&
                tableDeltas.tableDelta.create.length === 0 &&
                Object.keys(tableDeltas.tableDelta.alter).length === 0 &&
                tableDeltas.tableDelta.drop.length === 0 &&
                tableDeltas.joinTableDelta.create.length === 0 &&
                Object.keys(tableDeltas.joinTableDelta.alter).length === 0 &&
                tableDeltas.joinTableDelta.drop.length === 0 &&
                columnDeltas.changes.length === 0) {

                console.log('///////////////////////////');
                console.log('//// Models up to date ////');
                console.log('/// No migration needed ///');
                console.log('');

                return schwiftyMigrationNext(null);
            }

            const migrationFileContents = compiler({
                allTables,
                createdTables,
                tableDeltas,
                columnDeltas
            });

            migrationGroup.knex.migrate.make(userOptions.migrationName || 'schwifty-migration', {
                directory: migrationGroup.migrationsDir
            })
            .then(() => {

                const migrationsDirFiles = Fs.readdirSync(migrationsDir);
                const justCreatedMigration = migrationsDirFiles[migrationsDirFiles.length - 1];
                const justCreatedMigrationPath = Path.resolve(migrationsDir, justCreatedMigration);
                Fs.writeFileSync(justCreatedMigrationPath, migrationFileContents);

                if (userOptions.mode !== 'test') {
                    console.log('//////////////////////////');
                    console.log('/////// Success! /////////');
                    console.log('Generated new migration file:');
                    console.log('');
                    console.log(justCreatedMigrationPath);
                    console.log('');
                }

                return schwiftyMigrationNext(null);
            });
        });
    });
};

internals.diffTables = (migrationGroup, joinTables, allTables, cb) => {

    // Diff the tables in the db with our models and joinTables

    const { knex, migrationsDir } = migrationGroup;

    const knexTableDeltaObject = {
        migrationsDir,
        tableDelta: {
            create: [],
            alter: {},
            drop: []
        },
        joinTableDelta: {
            create: [],
            alter: {},
            drop: []
        }
    };

    /*
        Grabbed this func from https://github.com/steven-ferguson/knex-cleaner/blob/master/lib/knex_tables.js
        `knex-cleaner` project :+1:

        function getTablesNameSql(knex) {
          var client = knex.client.dialect;
          var databaseName = knex.client.databaseName ||
          knex.client.connectionSettings.database;

          switch(client) {
            case 'mysql':
              return "SELECT TABLE_NAME FROM information_schema.tables " +
              "WHERE TABLE_SCHEMA = '" + databaseName + "' " +
              "AND TABLE_TYPE = 'BASE TABLE'";
            case 'postgresql':
              return "SELECT tablename FROM pg_catalog.pg_tables" +
              " WHERE schemaname='public';";
            case 'sqlite3':
              return "SELECT name FROM sqlite_master WHERE type='table';";
            default:
              throw new Error('Could not get the sql to select table names from client: ' +
              client);
          }
        }

        function getTableNames(knex, options) {
          options = _.defaults(typeof options !== 'undefined' ? options : {}, DefaultOptions);

          return knex.raw(getTablesNameSql(knex))
            .then(function(resp) {
              return getSqlRows(knex, resp)
                .map(function(table) {
                  return table[Object.keys(table)[0]];
                })
                .filter(function(tableName) {
                  return !_.contains(options.ignoreTables, tableName);
                });
            });
        }
    */

    // TODO get a list of the tables in the knex here, and compare against
    // allTables to see if tables in the DB need to be deleted.

    // Use something similar to this block that I accidentally made for columns
    // D'oh!
    /*
        Promise.all(allDrops.map((tableName) => {

            return new Promise((resolve, reject) => {

                internals.getColumnsForTable(knex, tableName)
                .then((dbSchema) => {

                    modelDeltaObject.drop.push({
                        tableName: tableName,
                        columns: dbSchema
                    });
                    resolve();
                })
                .catch((err) => {

                    reject(err);
                })
            });
        }))
        .then(() => {

            knexTableDeltaObject.tableDelta.drop.push(modelDeltaObject);
            next();
        });
    */

    Items.serial(Object.keys(allTables), (tableName, tableNext) => {

        // Ping the db for existence of each table

        knex(tableName).select(knex.raw('1')).asCallback((err) => {

            if (err) {

                // This error can only be that the table is not there.
                // If there was a connection issue it would have cropped up earlier.

                if (Object.keys(joinTables).indexOf(tableName) !== -1) {
                    knexTableDeltaObject.joinTableDelta.create.push(tableName);
                }
                else {
                    knexTableDeltaObject.tableDelta.create.push(tableName);
                }
            }

            tableNext();
        });
    },
    () => {

        // no errors

        cb(null, knexTableDeltaObject);
    });
};

internals.diffColumns = (migrationGroup, cb) => {

    // Now let's diff our model schemas with what's in the db
    // - convert model schema to knex schema
    // - compile the derived knex schema using knex's columnCompiler
    // 'columnCompiler' contains a universal set of types that it then
    // converts into specific db types

    const { knex, models } = migrationGroup;

    const knexColumnDeltaObject = {
        changes: []
    };

    Items.serial(models, (model, modelNext) => {

        const modelName = model.tableName;

        const modelDeltaObject = {
            model: modelName,
            create: [],
            alter: {},
            drop: []
        };

        // It's about to go down

        const modelKnexSchema = joi2Knex(model.joiSchema);
        const tmpTableBuilder = knex.client.tableBuilder('create', 'schemaMap', () => {});
        const modelKnex2ColumnCompilerSchema = Object.keys(modelKnexSchema).reduce((collector, columnName) => {

            const tmpColumnBuilder = knex.client.columnBuilder(tmpTableBuilder, modelKnexSchema[columnName], []);
            const tmpColumnCompiler = knex.client.columnCompiler(tmpTableBuilder, tmpColumnBuilder);
            const columnType = tmpColumnCompiler.getColumnType();

            // columnType.split('(')[0] is specific for varchar values. Knex appends (255) to this columnType
            // if the varchar length can go up to 255
            // Remove the output (255) specified lengths from varchar types.
            // At this time we only care about the column types
            collector[columnName] = columnType.split('(')[0]; // To the right of this paren is specified the length if available (e.g. (255))
            return collector;
        }, {});

        internals.getColumnsForTable(knex, modelName)
        .then((dbSchema) => {

            const dbColsToConvert = Object.keys(dbSchema)
            .filter((colName) => ignoreColumns.indexOf(dbSchema[colName]) === -1);

            const db2ColumnCompilerSchema = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];
                collector[columnName] = db2ColumnCompiler(currentColumn);
                return collector;
            }, {});

            // The big diff!

            const delta = JsonDiffpatch.diff(db2ColumnCompilerSchema, modelKnex2ColumnCompilerSchema);

            if (delta) {

                Object.keys(delta).forEach((key) => {

                    switch (internals.getJsonDiffpatchChangeType(delta[key])) {

                        case 'create':
                            modelDeltaObject.create.push(key);
                            break;
                        case 'alter':
                            modelDeltaObject.alter[key] = [db2Knex(delta[key][0]), db2Knex(delta[key][1])];
                            break;
                        case 'drop':
                            modelDeltaObject.drop.push({
                                columnName: key,
                                columnType: db2Knex(dbSchema[key])
                            });
                            break;
                    }
                });

                knexColumnDeltaObject.changes.push(modelDeltaObject);
            }

            modelNext();
        });
    },
    (_) => {

        return cb(_, knexColumnDeltaObject);
    });
};


internals.getColumnsForTable = (knex, tableName) => {

    let resolve;

    const p = new Promise((res, rej) => {

        resolve = res;
    });

    knex.table(tableName).columnInfo()
    .then((dbSchema) => {

        const formattedDbSchema = {};

        Object.keys(dbSchema)
        .forEach((columnName) => {

            const columnSchema = dbSchema[columnName].type;
            delete columnSchema.defaultValue;
            formattedDbSchema[columnName] = columnSchema;
        });

        return resolve(formattedDbSchema);
    });

    return p;
};

internals.getJoinTableInfo = (model) => {

    const joinTables = [];

    if (model.relationMappings) {

        Object.keys(model.relationMappings).forEach((relationName) => {

            const relation = model.relationMappings[relationName];

            if (!relation.join.through) {
                return;
            }

            const joinTableFrom = relation.join.through.from.split('.');
            const joinTableTo = relation.join.through.to.split('.');
            const relationExtra = relation.join.through.extra || (relation.join.through.modelClass ? relation.join.through.modelClass.getJoiSchema() : Joi.object({}));

            let joiSchema;

            if (relationExtra.isJoi === true) {

                joiSchema = relationExtra;
            }
            else {
                joiSchema = Joi.object(relationExtra.reduce((collector, extra) => {

                    // Here, setting the default type for extras defined in
                    // relationMappings to be Joi.any();

                    const extraSchema = {};
                    extraSchema[extra] = Joi.any();

                    return Object.assign({}, collector, extraSchema);
                }, {}));
            }

            const toFromColumns = {};
            toFromColumns[joinTableFrom[1]] = Joi.any();
            toFromColumns[joinTableTo[1]] = Joi.any();

            joiSchema = joiSchema.keys(toFromColumns);

            joinTables.push({
                tableName: joinTableFrom[0], // TODO: Check how objection does this check
                joiSchema
            });
        });

        return joinTables;
    }

    return [];
};

internals.getJsonDiffpatchChangeType = (change) => {

    switch (change.length) {

        case 1:
            return 'create';

        case 2:
            return 'alter';

        case 3:
            return 'drop';
    }
};
