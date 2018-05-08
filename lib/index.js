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

const internals = {};

exports.returnCodes = {
    NO_MIGRATION: 1,
    MIGRATION: 2,
    MIGRATION_WITH_CONFLICT: 3
};

exports.genMigrationFile = (options, cb) => {

    const cbNextTick = (...args) => {

        return process.nextTick(() => {

            return cb(...args);
        });
    };

    const validOptions = Joi.validate(options, Schema.options);
    if (validOptions.error) {
        return cbNextTick(new Error(`Bad options passed to schwifty-migrate-diff: ${validOptions.error.message}`));
    }

    const skippedCols = [];
    const userOptions = Hoek.shallow(validOptions.value);

    if (userOptions.models.length === 0) {
        return cbNextTick(null, {
            code: exports.returnCodes.NO_MIGRATION,
            file: null,
            skippedColumns: []
        });
    }

    // Ping the knex instance to make sure we're connected to the db
    userOptions.knex.queryBuilder().select(userOptions.knex.raw('1'))
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

            const joinTableCollector = [];

            Items.serial(migrationGroup.models, (model, next) => {

                internals.getJoinTableInfo(model, knex, (err, results) => {

                    if (err) {
                        return next(err);
                    }

                    joinTableCollector.push(...results.joinTables);
                    skippedCols.push(...results.skippedCols);

                    return next();
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

                    internals.diffColumns(migrationGroup, joinTables, userOptions.mode, (diffColsErr, results) => {

                        if (diffColsErr) {
                            return cb(diffColsErr);
                        }

                        skippedCols.push(...results.skippedCols);

                        const { columnDeltas } = results;

                        // All finished diffing, time to make a migration file

                        const template = Fs.readFileSync(__dirname + '/hbs/migrationFileTemplate.hbs').toString();
                        const compiler = internals.handlebars().compile(template);
                        const createdTables = tableDeltas.tableDelta.create.concat(tableDeltas.joinTableDelta.create);

                        if (createdTables.length === 0 &&
                            columnDeltas.changes.length === 0) {

                            return cb(null, {
                                code: exports.returnCodes.NO_MIGRATION,
                                file: null,
                                skippedColumns: skippedCols
                            });
                        }

                        const tableSemiRegex = new RegExp('}\\)' + Os.EOL + '};', 'g');
                        const columnSemiRegex = new RegExp('\'\\)' + Os.EOL + '};', 'g');

                        const migrationFileContents = compiler({
                            allTables,
                            createdTables,
                            tableDeltas,
                            columnDeltas
                        })
                            .replace(tableSemiRegex, `});${Os.EOL}};`)
                            .replace(columnSemiRegex, `');${Os.EOL}};`);

                        migrationGroup.knex.migrate.make(userOptions.migrationName, {
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

                                        let returnCode = exports.returnCodes.MIGRATION;
                                        const schemaConflictExists = skippedCols.some((sc) => sc.schemaConflict);

                                        if (schemaConflictExists) {
                                            returnCode = exports.returnCodes.MIGRATION_WITH_CONFLICT;
                                        }

                                        return cb(null, {
                                            code: returnCode,
                                            file: justCreatedMigrationPath,
                                            skippedColumns: skippedCols
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
        knex(tableName).select(knex.raw('1'))
            .asCallback((err) => {

                if (err) {

                    const tableNotExists = [
                        `select 1 from "${tableName}" - relation "${tableName}" does not exist`, // postgres
                        `select 1 from \`${tableName}\` - ER_NO_SUCH_TABLE: Table`, // mysql
                        `select 1 from \`${tableName}\` - SQLITE_ERROR: no such table` // sqlite
                    ];

                    const recognizedErr = tableNotExists.find((errPartial) => err.message.includes(errPartial));

                    // This error tells us the table isn't there, information we're looking for
                    if (!recognizedErr) {
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

    const skippedCols = [];
    const knexColumnDeltaObject = {
        changes: []
    };

    const joinTablesAsModels = Object.keys(joinTables)
        .filter((tableName) => !models.find((m) => m.tableName === tableName))
        .map((tableName) => ({
            tableName,
            joiSchema: joinTables[tableName].joiSchema
        }));

    const allModels = models.concat(joinTablesAsModels);
    Items.serial(allModels, (model, next) => {

        const { tableName } = model;

        const modelDeltaObject = {
            tableName,
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

        internals.getColumnsForTable(knex, tableName, (err, dbSchema) => {

            if (err) {
                return next(err);
            }

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((column) => {

                    const type = dbSchema[column];
                    const [err] = Mappings.convertFuncs.getAliasVal(type);
                    if (err) {

                        // The join tables have already been taken care of
                        // so do not add to skippedCols

                        if (!joinTablesAsModels.find((jt) => jt.tableName === tableName)) {
                            skippedCols.push({
                                tableName,
                                column,
                                type,
                                schemaConflict: Object.keys(modelKnexSchema).includes(column)
                            });
                        }
                    }
                    return !err;
                });

            // Filter out any skippedCols from the model's schema so they don't get diffed
            // Note this is considered a schema conflict
            const filteredModelKnex2ColumnCompilerSchema = Object.keys(modelKnex2ColumnCompilerSchema)
                .reduce((collector, colName) => {

                    const isSkipped = skippedCols.find((sc) => sc.column === colName);
                    if (!isSkipped) {
                        collector[colName] = modelKnex2ColumnCompilerSchema[colName];
                    }
                    return collector;
                }, {});

            const db2ColumnCompilerSchema = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];

                // This error is handled above when anything failing `getAliasVal` gets rejected
                // and fed to skippedCols. db2ColumnCompiler just calls getAliasVal for now
                const [, db2ColumnCompilerConversion] = Mappings.convertFuncs.db2ColumnCompiler(currentColumn, ` for column "${columnName}"`);

                collector[columnName] = db2ColumnCompilerConversion;

                return collector;
            }, {});

            // Let's normalize these. dbs don't agree on what to name their datatypes,
            // here we get 'alias vals' to call them all the same thing so we can run a proper diff
            const normalizedDb2ColumnCompilerSchema = Object.keys(db2ColumnCompilerSchema).reduce((collector, keyName) => {

                const currentType = db2ColumnCompilerSchema[keyName];

                // This error is handled above when anything failing `getAliasVal`
                // gets rejected and fed to skippedCols
                const [, aliasVal] = Mappings.convertFuncs.getAliasVal(currentType);

                collector[keyName] = aliasVal;

                return collector;
            }, {});

            const normalizedModelKnex2ColumnCompilerSchema = Object.keys(filteredModelKnex2ColumnCompilerSchema).reduce((collector, keyName) => {

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

        cb(null, {
            columnDeltas: knexColumnDeltaObject,
            skippedCols
        });
    });
};


internals.getColumnsForTable = (knex, tableName, cb) => {

    knex.table(tableName).columnInfo()
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
    const skippedCols = [];

    Items.serial(Object.keys(model.relationMappings || {}), (relationName, next) => {

        const relation = model.relationMappings[relationName];

        if (!relation.join.through) {
            return next();
        }

        const { modelClass, from, to, extra } = relation.join.through;

        const joinTableFrom = from.split('.');
        const joinTableTo = to.split('.');
        const relationExtra = extra || Joi.object({});
        const tableName = joinTableFrom[0];

        internals.getColumnsForTable(knex, tableName, (err, dbSchema) => {

            if (err) {
                return next(err);
            }

            const dbColsToConvert = Object.keys(dbSchema)
                .filter((column) => {

                    const type = dbSchema[column];
                    const [err] = Mappings.convertFuncs.getAliasVal(type);
                    if (err) {
                        skippedCols.push({
                            tableName,
                            column,
                            type,
                            schemaConflict: false // Set as a default, may be overridden below
                        });
                    }
                    return !err;
                });

            const joiKeysToStrip = skippedCols.map((sc) => sc.column);

            // Update skippedCols to say there's a schemaConflict
            const onKeyStripped = (keyName) => {

                skippedCols.find((sc) => sc.column === keyName).schemaConflict = true;
            };

            if (modelClass) {
                joinTables.push({
                    tableName: modelClass.tableName,
                    joiSchema: internals.stripKeysFromJoi(modelClass.getJoiSchema(), joiKeysToStrip, onKeyStripped)
                });
                return next();
            }

            const db2JoiTypes = dbColsToConvert.reduce((collector, columnName) => {

                const currentColumn = dbSchema[columnName];

                // dbColsToConvert has filtered out invalid db column types
                // and fed them to skippedCols, no error will be
                // produced here
                const [, knexType] = Mappings.convertFuncs.db2Knex(currentColumn);

                Hoek.assert(Mappings.maps.knexJoiMap[knexType], `The left side of knexJoiMap must be in parity with the right side of columnCompilerKnexMap. Failed for ${knexType}`);

                // No errors should be produced
                const [, db2Joi] = Mappings.convertFuncs.knex2JoiType(knexType);

                return Object.assign({}, collector, {
                    [columnName]: db2Joi
                });
            }, {});

            const toFromColumns = {};
            const fromName = joinTableFrom[1];
            const toName = joinTableTo[1];

            toFromColumns[fromName] = Mappings.convertFuncs.string2Joi(db2JoiTypes[fromName] || 'any');
            toFromColumns[toName] = Mappings.convertFuncs.string2Joi(db2JoiTypes[toName] || 'any');

            // relationExtra is just an empty Joi object here if it 'isJoi'
            let joiSchema = relationExtra.isJoi ? relationExtra : Joi.object(
                relationExtra.reduce((collector, field) => {

                    return Object.assign({}, collector, {
                        [field]: Mappings.convertFuncs.string2Joi(db2JoiTypes[field] || 'any')
                    });
                }, {})
            );

            joiSchema = joiSchema.keys(toFromColumns);

            // Strip out any skippedCols
            joiSchema = internals.stripKeysFromJoi(joiSchema, joiKeysToStrip, onKeyStripped);

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

        cb(null, { joinTables, skippedCols });
    });
};

// Please note this interpretation of jsondiffpatch's output is
// specific to schwifty-migrate-diff's use-case
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

    const describeChildren = joiCompiledSchema.describe().children;

    const keysFromDescribe = Object.keys(describeChildren)
        .reduce((schema, keyName) => {

            const child = describeChildren[keyName];
            schema[keyName] = Mappings.convertFuncs.string2Joi(Mappings.convertFuncs.stringFromJoiDescribeChild(child));
            return schema;
        }, {});

    return joiUncompiledSchema.keys(keysFromDescribe);
};

internals.stripKeysFromJoi = (joiCompiledSchema, keysToStrip, onKeyStripped) => {

    const describeChildren = joiCompiledSchema.describe().children;
    return Joi.object(Object.keys(describeChildren)
        .reduce((schema, childName) => {

            if (keysToStrip.includes(childName)) {
                onKeyStripped(childName);
            }
            else {
                const child = describeChildren[childName];
                schema[childName] = Mappings.convertFuncs.string2Joi(Mappings.convertFuncs.stringFromJoiDescribeChild(child));
            }
            return schema;
        }, {}));
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
        .reduce((collector, err) => `${collector}\n${err.message}`, 'Multiple errors:');
    return new Error(messages);
};

internals.handlebars = () => {

    const handlebars = Handlebars.create();

    // Handlebars helpers

    handlebars.registerHelper('someObjectPropsHaveValue', (obj) => {

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

    handlebars.registerHelper('itemNotInArray', (item, arr) => {

        return arr.indexOf(item) === -1;
    });

    handlebars.registerHelper('keyFromObject', (key, obj) => {

        return obj[key];
    });

    handlebars.registerHelper('indexFromArray', (index, arr) => {

        return arr[index];
    });

    handlebars.registerHelper('objectKeys', (obj) => {

        return Object.keys(obj);
    });

    // Partials

    Fs.readdirSync(`${__dirname}/hbs/partials/`)
        .forEach((fileName) => {

            handlebars.registerPartial(
                fileName.split('.hbs')[0],
                String(Fs.readFileSync(`${__dirname}/hbs/partials/${fileName}`))
            );
        });

    return handlebars;
};
