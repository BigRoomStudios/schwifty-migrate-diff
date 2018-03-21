'use strict';

const JsonDiffpatch = require('jsondiffpatch');
const Hoek = require('hoek');
const Joi = require('joi');
const Path = require('path');
const Items = require('items');
const Schema = require('./schema');
const Handlebars = require('handlebars');
const Fs = require('fs');

const Mappings = require('./mappings');

const internals = {};

exports.genMigrationFile = (options, cb) => {

    Joi.assert(options, Schema.options, 'Bad options passed to schwifty-migration.');

    const userOptions = Hoek.shallow(options);

    if (userOptions.models.length === 0) {
        return cb(null, '');
    }

    const { models, migrationsDir, knex } = userOptions;

    const migrationGroup = { models, migrationsDir, knex };

    // Grabbed from Schwifty's migrator.js
    // Absolutize and normalize

    migrationGroup.migrationsDir = Path.isAbsolute(migrationGroup.migrationsDir) ?
        Path.normalize(migrationGroup.migrationsDir) :
        Path.join(process.cwd(), migrationGroup.migrationsDir);

    // Grab join table info

    let joinTableCollector = [];

    Items.serial(migrationGroup.models, (model, next) => {

        internals.getJoinTableInfo(model, knex, (_, info) => {

            joinTableCollector = joinTableCollector.concat(info);
            next();
        });
    },
    (_) => {

        const joinTables = joinTableCollector.reduce((collector, joinTable) => {

            // Dedupe the joinTables -- multiple models can reference the same joinTable,
            // so we might have more than one entry for the same join table
            // across different models.

            const { tableName, joiSchema } = joinTable;

            if (!collector[tableName]) {

                const joiAsKnexSchema = Mappings.convertFuncs.joi2Knex(joiSchema);

                collector[tableName] = {
                    joiSchema,
                    knexSchema: joiAsKnexSchema
                };
            }
            else {

                // We've already stored this joinTable in the collector. So let's
                // merge the schemas of that one and this one

                // This way you can specify an array of extras in one model's relation and
                // a different set of extras on a different model

                // Merge the joiSchemas and knexSchemas

                const describe = joiSchema.describe().children;

                const keysFromDescribe = Object.keys(describe)
                    .reduce((schema, keyName) => {

                        const type = describe[keyName].type;
                        schema[keyName] = Joi[type]();
                        return schema;
                    }, {});

                collector[tableName].joiSchema = collector[tableName].joiSchema.keys(keysFromDescribe);


                const joiAsKnexSchema = Mappings.convertFuncs.joi2Knex(joiSchema);

                collector[tableName].knexSchema = Object.assign(
                    {},
                    collector[tableName].knexSchema,
                    joiAsKnexSchema
                );
            }

            return collector;

        }, {});

        const regularTables = migrationGroup.models.reduce((collector, model) => {

            const joi2KnexSchema = Mappings.convertFuncs.joi2Knex(model.joiSchema);

            collector[model.tableName] = {
                joiSchema: model.joiSchema,
                knexSchema: joi2KnexSchema
            };

            return collector;

        }, {});

        // Create tables collector, 'allTables'

        const allTables = Object.assign({}, joinTables, regularTables);

        internals.diffTables(migrationGroup, joinTables, allTables, userOptions.mode, (ignoreError, tableDeltas) => {

            /* eslint-disable no-shadow */
            internals.diffColumns(migrationGroup, joinTables, userOptions.mode, (ignoreError, columnDeltas) => {

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

                Handlebars.registerHelper('tableMaybeSemi', (step, currentItem, deltaObj, columnDeltaObj, tableType) => {

                    let nonCreateColumnChanges = false;

                    for (let i = 0; i < columnDeltaObj.changes.length; ++i) {

                        const currentColChanges = columnDeltaObj.changes[i];
                        if (Object.keys(currentColChanges.alter).length !== 0 ||
                            currentColChanges.drop.length !== 0) {

                            nonCreateColumnChanges = true;
                        }
                    }

                    let lastIndex;

                    switch (step) {

                        case 'create':

                            if (tableType === 'tableDelta') {
                                lastIndex = deltaObj[tableType].create.length - 1;
                                if (deltaObj[tableType].create.indexOf(currentItem) === lastIndex) {

                                    // This is the last model in the create list

                                    if (deltaObj.joinTableDelta.create.length === 0 &&
                                        !nonCreateColumnChanges) {
                                        return ';';
                                    }
                                }
                            }
                            else {
                                // tableType === 'joinTableDelta'
                                lastIndex = deltaObj[tableType].create.length - 1;
                                if (deltaObj[tableType].create.indexOf(currentItem) === lastIndex &&
                                    !nonCreateColumnChanges) {

                                    // This is the last model in the create list

                                    return ';';
                                }
                            }

                            break;

                        case 'drop':

                            if (tableType === 'tableDelta') {
                                lastIndex = deltaObj[tableType].create.length - 1;
                                if (deltaObj[tableType].create.indexOf(currentItem) === lastIndex &&
                                    !nonCreateColumnChanges) {

                                    // This is the last model in the create list
                                    if (deltaObj.joinTableDelta.create.length === 0) {
                                        return ';';
                                    }
                                }
                            }
                            else {
                                // tableType === 'joinTableDelta'
                                lastIndex = deltaObj[tableType].create.length - 1;
                                if (deltaObj[tableType].create.indexOf(currentItem) === lastIndex &&
                                    !nonCreateColumnChanges) {

                                    // This is the last model in the create list
                                    return ';';
                                }
                            }

                            break;
                    }

                    return '';
                });

                Handlebars.registerHelper('columnMaybeSemi', (step, currentItem, deltaObj, tableType) => {

                    let lastIndex;

                    switch (step) {

                        case 'alter':

                            lastIndex = deltaObj.changes.length - 1;

                            let currentItemIndex;
                            for (let i = 0; i < deltaObj.changes.length; ++i) {

                                if (typeof currentItemIndex !== 'undefined') {
                                    continue;
                                }

                                if (deltaObj.changes[i].model === currentItem.model) {
                                    currentItemIndex = i;
                                }
                            }

                            if (currentItemIndex === lastIndex) {

                                return ';';
                            }

                            break;
                    }

                    return '';
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
                    columnDeltas.changes.length === 0) {

                    return cb(null, 'No migration needed');
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

                        return cb(null, justCreatedMigrationPath);
                    });
            });
        });
    });
};

internals.diffTables = (migrationGroup, joinTables, allTables, mode, cb) => {

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
    (ignoreError) => {

        // There can't be any actual errors because here, an error gives us information
        // (That the table isn't there)

        cb(ignoreError, knexTableDeltaObject);
    });
};

internals.diffColumns = (migrationGroup, joinTables, mode, cb) => {

    // Now let's diff our model schemas with what's in the db
    // 1 - convert model schema to knex schema
    // 2 - compile the derived knex schema using knex's columnCompiler
    // 'columnCompiler' contains a universal set of types that it then
    // converts into specific db types

    const { knex, models } = migrationGroup;

    const knexColumnDeltaObject = {
        changes: []
    };

    const joinTablesAsModels = Object.keys(joinTables)
        .reduce((collector, jtName) => {

            const jt = joinTables[jtName];

            if (!!models.find((m) => m.tableName === jtName)) {
                return collector;
            }

            collector.push({ tableName: jtName, joiSchema: jt.joiSchema });
            return collector;
        }, []);

    Items.serial(models.concat(joinTablesAsModels), (model, modelNext) => {

        const modelName = model.tableName;

        const modelDeltaObject = {
            model: modelName,
            create: [],
            alter: {},
            drop: []
        };

        // It's about to go down

        const modelKnexSchema = Mappings.convertFuncs.joi2Knex(model.joiSchema);

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

        internals.getColumnsForTable(knex, modelName, (ignoreError, dbSchema) => {

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((colName) => Mappings.ignoreColumns.indexOf(dbSchema[colName]) === -1);

            const db2ColumnCompilerSchema = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];
                const db2ColumnCompilerConversion = Mappings.convertFuncs.db2ColumnCompiler(currentColumn);

                collector[columnName] = db2ColumnCompilerConversion;

                return collector;
            }, {});

            // Let's normalize these

            const normalizedDb2ColumnCompilerSchema = Object.keys(db2ColumnCompilerSchema).reduce((collector, keyName) => {

                const currentType = db2ColumnCompilerSchema[keyName];
                collector[keyName] = Mappings.convertFuncs.getAliasVal(currentType);
                return collector;
            }, {});

            const normalizedModelKnex2ColumnCompilerSchema = Object.keys(modelKnex2ColumnCompilerSchema).reduce((collector, keyName) => {

                const currentType = modelKnex2ColumnCompilerSchema[keyName];
                collector[keyName] = Mappings.convertFuncs.getAliasVal(currentType);
                return collector;
            }, {});

            // The big diff!

            const delta = JsonDiffpatch.diff(normalizedDb2ColumnCompilerSchema, normalizedModelKnex2ColumnCompilerSchema);

            if (delta) {

                Object.keys(delta).forEach((key) => {

                    switch (internals.getJsonDiffpatchChangeType(delta[key])) {

                        case 'create':
                            modelDeltaObject.create.push(key);
                            break;
                        case 'alter':

                            if (mode !== 'alter') {
                                return;
                            }

                            const db2KnexKey0 = Mappings.convertFuncs.db2Knex(delta[key][0]);
                            const db2KnexKey1 = Mappings.convertFuncs.db2Knex(delta[key][1]);

                            modelDeltaObject.alter[key] = [db2KnexKey0, db2KnexKey1];

                            break;
                        case 'drop':

                            if (mode !== 'alter') {
                                return;
                            }

                            const db2KnexKey = Mappings.convertFuncs.db2Knex(dbSchema[key]);

                            modelDeltaObject.drop.push({
                                columnName: key,
                                columnType: db2KnexKey
                            });

                            break;
                    }
                });

                knexColumnDeltaObject.changes.push(modelDeltaObject);
            }

            modelNext();
        });
    },
    (ignoreError) => {

        return cb(ignoreError, knexColumnDeltaObject);
    });
};


internals.getColumnsForTable = (knex, tableName, cb) => {

    knex.table(tableName).columnInfo()
        .then((dbSchema) => {

            const formattedDbSchema = {};

            Object.keys(dbSchema)
                .forEach((columnName) => {

                    const columnSchema = dbSchema[columnName].type;
                    delete columnSchema.defaultValue;
                    formattedDbSchema[columnName] = columnSchema;
                });

            return cb(null, formattedDbSchema);
        });
};

internals.getJoinTableInfo = (model, knex, cb) => {

    const joinTables = [];

    if (!model.relationMappings) {
        return cb(null, []);
    }

    Items.serial(Object.keys(model.relationMappings), (relationName, next) => {

        const relation = model.relationMappings[relationName];

        if (!relation.join.through) {
            return next();
        }

        const modelClass = relation.join.through.modelClass;

        if (modelClass) {
            joinTables.push({
                tableName: modelClass.tableName,
                joiSchema: modelClass.getJoiSchema()
            });
            return next();
        }

        const joinTableFrom = relation.join.through.from.split('.');
        const joinTableTo = relation.join.through.to.split('.');
        const relationExtra = relation.join.through.extra || Joi.object({});

        const tableName = joinTableFrom[0];

        internals.getColumnsForTable(knex, tableName, (ignoreError, dbSchema) => {

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((colName) => Mappings.ignoreColumns.indexOf(dbSchema[colName]) === -1);

            const db2JoiTypes = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];
                const db2Joi = Mappings.convertFuncs.knex2JoiType(Mappings.convertFuncs.db2Knex(currentColumn));

                collector[columnName] = db2Joi;

                return collector;
            }, {});


            let joiSchema;

            if (relationExtra.isJoi === true) {

                joiSchema = relationExtra;
            }
            else {
                joiSchema = Joi.object(relationExtra.reduce((collector, extra) => {

                    let joiType = 'any';

                    if (!!db2JoiTypes[extra]) {
                        joiType = db2JoiTypes[extra];
                    }

                    let extraSchema;

                    if (joiType === 'numberInteger') {
                        extraSchema = {
                            [extra]: Joi.number().integer()
                        };
                    }
                    else {
                        extraSchema = {
                            [extra]: Joi[joiType]()
                        };
                    }

                    return Object.assign({}, collector, extraSchema);
                }, {}));
            }

            const toFromColumns = {};

            const fromName = joinTableFrom[1];
            const toName = joinTableTo[1];

            let fromJoiType = 'any';
            let toJoiType = 'any';

            if (!!db2JoiTypes[fromName]) {
                fromJoiType = db2JoiTypes[fromName];
            }

            if (!!db2JoiTypes[toName]) {
                toJoiType = db2JoiTypes[toName];
            }


            if (fromJoiType === 'numberInteger') {
                toFromColumns[fromName] = Joi.number().integer();
            }
            else {
                toFromColumns[fromName] = Joi[fromJoiType]();
            }

            if (fromJoiType === 'numberInteger') {
                toFromColumns[toName] = Joi.number().integer();
            }
            else {
                toFromColumns[toName] = Joi[toJoiType]();
            }

            joiSchema = joiSchema.keys(toFromColumns);

            joinTables.push({
                tableName,
                joiSchema
            });

            return next();
        });
    },
    (_) => {

        return cb(null, joinTables);
    });
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
