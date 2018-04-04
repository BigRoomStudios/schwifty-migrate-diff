'use strict';

const Os = require('os');
const Fs = require('fs');
const Path = require('path');

const Joi = require('joi');
const Hoek = require('hoek');
const Items = require('items');

const Handlebars = require('handlebars');
const JsonDiffpatch = require('jsondiffpatch');

const Schema = require('./schema');
const Mappings = require('./mappings');
const Promise = require('bluebird');

const internals = {};

exports.returnCodes = {
    NO_MIGRATION: 1,
    MIGRATION: 2
};

exports.genMigrationFile = (options, cb) => {

    const validOptions = Joi.validate(options, Schema.options);
    if (validOptions.error) {
        return cb(new Error(`Bad options passed to schwifty-migration: ${validOptions.error.message}`));
    }

    internals.skippedCols = [];

    const userOptions = Hoek.shallow(options);

    if (userOptions.models.length === 0) {
        return cb(null, {
            code: exports.returnCodes.NO_MIGRATION,
            file: null,
            skippedColumns: []
        });
    }

    // Ping the knex instance to make sure we're connected to the db
    Promise.resolve(userOptions.knex.queryBuilder().select(userOptions.knex.raw('1')))
        .asCallback((err) => {

            if (err) {
                return cb(err);
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

                internals.getJoinTableInfo(model, knex, (err, info) => {

                    if (err) {
                        return next(err);
                    }

                    joinTableCollector = joinTableCollector.concat(info);
                    next();
                });
            },
            (err) => {

                if (err) {
                    return cb(err);
                }

                const errors = [];

                const joinTables = joinTableCollector.reduce((collector, joinTable) => {

                    // Dedupe the joinTables -- multiple models can reference the same joinTable,
                    // so we might have more than one entry for the same join table
                    // across different models.

                    const { tableName, joiSchema } = joinTable;

                    if (!collector[tableName]) {

                        const [err, joiAsKnexSchema] = Mappings.convertFuncs.joi2Knex(joiSchema, ` in model "${tableName}"`);

                        if (err) {
                            errors.push(err);
                        }
                        else {
                            collector[tableName] = {
                                joiSchema,
                                knexSchema: joiAsKnexSchema
                            };
                        }
                    }
                    else {

                        // We've already stored this joinTable in the collector. So let's
                        // merge the schemas of that one and this one

                        // This way you can specify an array of extras in one model's relation and
                        // a different set of extras on a different model

                        // Merge the joiSchemas and knexSchemas

                        collector[tableName].joiSchema = internals.mergeJoiCompiled(collector[tableName].joiSchema, joiSchema);

                        // We can't have an error here because those get caught
                        // in the above condition, when it first gets added
                        // to the collector
                        const [, joiAsKnexSchema] = Mappings.convertFuncs.joi2Knex(collector[tableName].joiSchema, ` in model "${tableName}"`);

                        collector[tableName].knexSchema = Object.assign(
                            {},
                            collector[tableName].knexSchema,
                            joiAsKnexSchema
                        );
                    }

                    return collector;

                }, {});

                const reducedErrors = internals.reduceErrors(errors);
                if (reducedErrors) {
                    return cb(reducedErrors);
                }

                const regTableErrors = [];

                const regularTables = migrationGroup.models.reduce((collector, model) => {

                    const [err, joi2KnexSchema] = Mappings.convertFuncs.joi2Knex(model.joiSchema, ` in model "${model.tableName}"`);

                    if (err) {
                        regTableErrors.push(err);
                    }
                    else {
                        collector[model.tableName] = {
                            joiSchema: model.joiSchema,
                            knexSchema: joi2KnexSchema
                        };
                    }

                    return collector;

                }, {});

                const reducedRegTableErrors = internals.reduceErrors(regTableErrors);
                if (reducedRegTableErrors) {
                    return cb(reducedRegTableErrors);
                }

                // Create tables collector, 'allTables'

                const allTables = Object.assign({}, joinTables, regularTables);

                internals.diffTables(migrationGroup, joinTables, allTables, userOptions.mode, (err, tableDeltas) => {

                    if (err) {
                        return cb(err);
                    }

                    internals.diffColumns(migrationGroup, joinTables, userOptions.mode, (diffColsErr, columnDeltas) => {

                        if (diffColsErr) {
                            return cb(diffColsErr);
                        }

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

                        let dedupedSkippedCols = [];

                        if (!!internals.skippedCols.length) {
                            dedupedSkippedCols = internals.skippedCols.filter((skippedInfo, i) => {

                                return internals.skippedCols.indexOf(skippedInfo) === i;
                            });
                        }

                        if (createdTables.length === 0 &&
                            columnDeltas.changes.length === 0) {

                            return cb(null, {
                                code: exports.returnCodes.NO_MIGRATION,
                                file: null,
                                skippedColumns: dedupedSkippedCols
                            });
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
                            .asCallback((err) => {

                                if (err) {
                                    return cb(err);
                                }

                                const migrationsDirFiles = Fs.readdirSync(migrationsDir);
                                const justCreatedMigration = migrationsDirFiles[migrationsDirFiles.length - 1];
                                const justCreatedMigrationPath = Path.resolve(migrationsDir, justCreatedMigration);
                                Fs.writeFile(justCreatedMigrationPath, migrationFileContents,
                                    (err) => {

                                        if (err) {
                                            return cb(err);
                                        }

                                        return cb(null, {
                                            code: exports.returnCodes.MIGRATION,
                                            file: justCreatedMigrationPath,
                                            skippedColumns: dedupedSkippedCols
                                        });
                                    }
                                );
                            });
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

        Promise.resolve(knex(tableName).select(knex.raw('1')))
            .asCallback((err) => {

                if (err) {

                    // This error tells us the table isn't there, information we're looking for

                    if (err.message !== `select 1 from "${tableName}" - relation "${tableName}" does not exist` && // postgres
                        !err.message.includes(`select 1 from \`${tableName}\` - ER_NO_SUCH_TABLE: Table`)) { // mysql
                        return tableNext(err);
                    }

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
    (err) => {

        if (err) {
            return cb(err);
        }

        cb(null, knexTableDeltaObject);
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

    const allModels = models.concat(joinTablesAsModels);
    Items.serial(allModels, (model, next) => {

        const modelName = model.tableName;

        const modelDeltaObject = {
            model: modelName,
            create: [],
            alter: {},
            drop: []
        };

        // It's about to go down

        // If a model or join table has a bad joi schema, then by this point
        // genMigrationFile has responded to its caller with an error
        // no error will be generated here

        const [, modelKnexSchema] = Mappings.convertFuncs.joi2Knex(model.joiSchema);

        const tmpTableBuilder = knex.client.tableBuilder('create', 'schemaMap', () => {});
        const modelKnex2ColumnCompilerSchema = Object.keys(modelKnexSchema).reduce((collector, columnName) => {

            const tmpColumnBuilder = knex.client.columnBuilder(tmpTableBuilder, modelKnexSchema[columnName], []);
            const tmpColumnCompiler = knex.client.columnCompiler(tmpTableBuilder, tmpColumnBuilder);
            const columnType = tmpColumnCompiler.getColumnType();

            // columnType.split('(')[0] is specific for varchar values. Knex appends (255) (or whichever length) to this columnType
            // Remove the output (xyz) specified lengths from varchar types.
            // At this time we only care about the column types not the lengths
            collector[columnName] = columnType.split('(')[0];
            return collector;
        }, {});

        internals.getColumnsForTable(knex, modelName, (err, dbSchema) => {

            if (err) {
                return next(err);
            }

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((colName) => {

                    const colType = dbSchema[colName];
                    const [err] = Mappings.convertFuncs.getAliasVal(colType);
                    if (err) {
                        internals.skippedCols.push(`model: ${modelName}, colName: ${colName}, colType: ${colType}`);
                    }
                    return !err;
                });

            const db2ColumnCompilerSchema = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];
                // This error is handled above when anything failing `getAliasVal` gets rejected
                // and fed to internals.skippedCols. db2ColumnCompiler just calls getAliasVal for now

                const [, db2ColumnCompilerConversion] = Mappings.convertFuncs.db2ColumnCompiler(currentColumn, ` for column "${columnName}"`);

                collector[columnName] = db2ColumnCompilerConversion;

                return collector;
            }, {});

            // Let's normalize these

            const normalizedDb2ColumnCompilerSchema = Object.keys(db2ColumnCompilerSchema).reduce((collector, keyName) => {

                const currentType = db2ColumnCompilerSchema[keyName];

                // This error is handled above when anything failing `getAliasVal`
                // gets rejected and fed to internals.skippedCols

                const [, aliasVal] = Mappings.convertFuncs.getAliasVal(currentType);

                collector[keyName] = aliasVal;

                return collector;
            }, {});

            const normalizedModelKnex2ColumnCompilerSchema = Object.keys(modelKnex2ColumnCompilerSchema).reduce((collector, keyName) => {

                const currentType = modelKnex2ColumnCompilerSchema[keyName];

                // By extension of weeding out bad Joi schemas early,
                // modelKnex2ColumnCompilerSchema will not produce any errors
                // here because all Joi values are valid for mappings.js

                const [, aliasVal] = Mappings.convertFuncs.getAliasVal(currentType);

                collector[keyName] = aliasVal;

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

                            // Enforcing 'mode' here
                            if (mode !== 'alter') {
                                return;
                            }

                            // db2Knex is a helper func that does a couple steps for you
                            // including running db2ColumnCompiler.
                            // Since we've already weeded out errors with db2ColumnCompiler above,
                            // these will produce no errors
                            const [, db2KnexKey0] = Mappings.convertFuncs.db2Knex(delta[key][0]);
                            const [, db2KnexKey1] = Mappings.convertFuncs.db2Knex(delta[key][1]);

                            modelDeltaObject.alter[key] = [db2KnexKey0, db2KnexKey1];

                            break;

                        case 'drop':

                            // Enforcing 'mode' here
                            if (mode !== 'alter') {
                                return;
                            }

                            // will produce no errors
                            const [, db2KnexKey] = Mappings.convertFuncs.db2Knex(dbSchema[key]);

                            modelDeltaObject.drop.push({
                                columnName: key,
                                columnType: db2KnexKey
                            });

                            break;
                    }
                });

                knexColumnDeltaObject.changes.push(modelDeltaObject);
            }

            next();
        });
    },
    (err) => {

        if (err) {
            return cb(err);
        }

        cb(null, knexColumnDeltaObject);
    });
};


internals.getColumnsForTable = (knex, tableName, cb) => {

    Promise.resolve(knex.table(tableName).columnInfo())
        .asCallback((err, dbSchema) => {

            if (err) {
                return cb(err);
            }

            const formattedDbSchema = {};

            Object.keys(dbSchema)
                .forEach((columnName) => {

                    const columnSchema = dbSchema[columnName].type;
                    delete columnSchema.defaultValue;
                    formattedDbSchema[columnName] = columnSchema;
                });

            cb(null, formattedDbSchema);
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

        internals.getColumnsForTable(knex, tableName, (err, dbSchema) => {

            if (err) {
                return next(err);
            }

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((colName) => {

                    const colType = dbSchema[colName];
                    const [err] = Mappings.convertFuncs.getAliasVal(colType);
                    if (err) {
                        internals.skippedCols.push(`model: ${tableName}, colName: ${colName}, colType: ${colType}`);
                    }
                    return !err;
                });

            const db2JoiTypes = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];

                // dbColsToConvert has filtered out invalid db column types
                // and fed them to internals.skippedCols, no error will be
                // produced here
                const [, knexType] = Mappings.convertFuncs.db2Knex(currentColumn);

                // It's mapping.js's job to keep the left side of knexJoiMap
                // in parity with the right side of columnCompilerKnexMap
                // No errors should be produced
                const [, db2Joi] = Mappings.convertFuncs.knex2JoiType(knexType);

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

                    const extraSchema = {
                        [extra]: Mappings.convertFuncs.string2Joi(joiType)
                    };

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

            toFromColumns[fromName] = Mappings.convertFuncs.string2Joi(fromJoiType);
            toFromColumns[toName] = Mappings.convertFuncs.string2Joi(toJoiType);

            joiSchema = joiSchema.keys(toFromColumns);

            joinTables.push({
                tableName,
                joiSchema
            });

            return next();
        });
    },
    (err) => {

        if (err) {
            return cb(err);
        }

        cb(null, joinTables);
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

internals.mergeJoiCompiled = (joiUncompiledSchema, joiCompiledSchema) => {

    const describe = joiCompiledSchema.describe().children;

    const keysFromDescribe = Object.keys(describe)
        .reduce((schema, keyName) => {

            const type = describe[keyName].type;
            schema[keyName] = Joi[type]();
            return schema;
        }, {});

    return joiUncompiledSchema.keys(keysFromDescribe);
};

internals.reduceErrors = (errors) => {

    if (errors.length === 0) {
        return null;
    }

    const dedupedErrors = errors
        .filter((err) => {

            const matchingErrIndex = errors.indexOf(errors.find((e) => e.message === err.message));
            return matchingErrIndex === errors.indexOf(err);
        });

    if (dedupedErrors.length === 1) {
        return dedupedErrors[0];
    }

    const messages = dedupedErrors
        .reduce((collector, err) => `${collector}${Os.EOL}${err.message}`, 'Multiple errors:');
    return new Error(messages);
};
