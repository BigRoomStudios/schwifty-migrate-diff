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

    Joi.assert(options, Schema.options, 'Bad options passed to schwifty-migration.');

    const userOptions = Hoek.shallow(options);

    internals.userOptions = userOptions;

    const migrationGroups = userOptions.migrationGroups.reduce((collector, mGroup) => {

        // Grabbed from Schwifty's migrator.js
        // Absolutize and normalize

        mGroup.migrationsDir = Path.isAbsolute(mGroup.migrationsDir) ?
            Path.normalize(mGroup.migrationsDir) :
            Path.join(process.cwd(), mGroup.migrationsDir);

        // Don't include if there aren't any models
        if (mGroup.models.length !== 0) {
            collector.push(mGroup);
        }

        return collector;
    }, []);

    let models = migrationGroups
    .reduce((collector, mGroup) => {

        collector = collector.concat(mGroup.models);
        return collector;
    }, []);

    // Grab join table info

    const joinTables = models.reduce((collector, model) => {

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

        if (!collector[joinTable.tableName]) {

            collector[joinTable.tableName] = {
                joiSchema: joinTable.joiSchema,
                knexSchema: joi2Knex(joinTable.joiSchema)
            };
        }
        else {

            // We've already stored this joinTable in the collector. So let's
            // merge the schemas of that one and this one

            // Object.assign the joiSchema and knexSchemas

            collector[joinTable.tableName].joiSchema = Object.assign(
                {},
                collector[joinTable.tableName].joiSchema,
                joinTable.joiSchema
            );

            collector[joinTable.tableName].knexSchema = Object.assign(
                {},
                collector[joinTable.tableName].knexSchema,
                joi2Knex(joinTable.joiSchema)
            );
        }

        return collector;

    }, {});

    // Prepare models for going into internals.allTables
    // See the internals.allTables schema in a comment the top of the file

    models = models.reduce((collector, model) => {

        collector[model.tableName] = {
            joiSchema: model.joiSchema,
            knexSchema: joi2Knex(model.joiSchema)
        };

        return collector;

    }, {});

    // Create tables collector, allTables

    const allTables = Object.assign({}, joinTables, models);

    internals.diffTables(migrationGroups, joinTables, allTables, (err, knexTableDeltas) => {

        if (err) {
            console.error(err);
            process.exit(1);
        }

        internals.diffColumns(migrationGroups, joinTables, allTables, (err, knexColumnDeltas) => {

            if (err) {
                console.error(err);
                process.exit(1);
            }

            // All finished diffing, time to make the migrationFiles

            let deltasByMigrationsDir = knexTableDeltas.reduce((collector, tableDelta) => {

                if (!collector[tableDelta.migrationsDir]) {
                    collector[tableDelta.migrationsDir] = { tableDeltas: [tableDelta] };
                }
                else {
                    collector[tableDelta.migrationsDir].tableDeltas.push(tableDelta);
                }

                return collector;
            }, {});

            deltasByMigrationsDir = knexColumnDeltas.reduce((collector, columnDelta) => {

                if (!collector[columnDelta.migrationsDir]) {
                    collector[columnDelta.migrationsDir] = { columnDeltas: [columnDelta] };
                }
                else if (!collector[columnDelta.migrationsDir].columnDeltas) {
                    collector[columnDelta.migrationsDir].columnDeltas = [columnDelta];
                }
                else {
                    collector[columnDelta.migrationsDir].columnDeltas.push(columnDelta);
                }

                return collector;
            }, deltasByMigrationsDir);

            Handlebars.registerHelper('stringify', (any) => {

                return JSON.stringify(any);
            });

            Handlebars.registerHelper('someObjectPropsHaveLength', (obj) => {

                return Object.keys(obj).some((objKey) => {

                    const currentProp = obj[objKey];
                    return Array.isArray(currentProp) && currentProp.length !== 0;
                });
            });

            Handlebars.registerHelper('itemNotInArray', (item, arr) => {

                return arr.indexOf(item) === -1;
            });

            Handlebars.registerHelper('keyInObject', (key, obj) => {

                return key in obj;
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

            Handlebars.registerHelper('var', (varName, value) => {

                this[varName] = value;
            });

            Fs.readdirSync(`${__dirname}/hbs/partials/`)
            .forEach((fileName) => {

                Handlebars.registerPartial(
                    fileName.split('.hbs')[0],
                    String(Fs.readFileSync(`${__dirname}/hbs/partials/${fileName}`))
                );
            });

            const compiler = Handlebars.compile(String(Fs.readFileSync(__dirname + '/hbs/migrationFileTemplate.hbs')));

            Items.parallel(Object.keys(deltasByMigrationsDir), (migrationsDir, nextParallel) => {

                const migrations = deltasByMigrationsDir[migrationsDir];

                const createdTables = migrations.tableDeltas.reduce((collector, item) => {

                    return collector
                        .concat(item.tableDelta.create)
                        .concat(item.joinTableDelta.create);
                }, []);

                const migrationFileContents = compiler({
                    migrations,
                    allTables,
                    createdTables
                });

                migrations.tableDeltas[0].knex.migrate.make('schwifty-migration', {
                    directory: migrationsDir
                })
                .then(() => {

                    const migrationsDirFiles = Fs.readdirSync(migrationsDir);
                    const justCreatedMigration = migrationsDirFiles[migrationsDirFiles.length - 1];
                    const justCreatedMigrationPath = Path.resolve(migrationsDir, justCreatedMigration);
                    Fs.writeFileSync(justCreatedMigrationPath, migrationFileContents);

                    if (internals.userOptions.mode !== 'test') {
                        console.log('//////////////////////////');
                        console.log('/////// Success! /////////');
                        console.log('Generated new migration file:');
                        console.log('');
                        console.log(justCreatedMigrationPath);
                        console.log('');
                    }
                    nextParallel();
                });
            },
            (err) => {

                if (err) {
                    console.error(err);
                    process.exit(1);
                }

                return schwiftyMigrationNext(null);
            });
        });
    });
};

internals.diffTables = (migrationGroups, joinTables, allTables, cb) => {

    // Diff the tables in the db with our models and joinTables

    const knexes = internals.dedupeKnexes(migrationGroups);

    // For each knex, gather the models on that knex and check the tables
    // This allows us to handle migrations on multiple knex instances!

    const knexTableDeltas = [];

    Items.parallel(knexes, (knex, knexNext) => {

        const knexTableDeltaObject = {
            knex,
            migrationsDir: internals.getMigrationsDirForKnex(migrationGroups, knex),
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

        Items.parallel(Object.keys(allTables), (tableName, tableNext) => {

            // Ping the db for existence of each table

            knex(tableName).select(knex.raw('1')).asCallback((err) => {

                if (err) {

                    // TODO check the error, make sure it's because the table isn't there. This error could be anything

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

            knexTableDeltas.push(knexTableDeltaObject);
            knexNext(null);
        });
    },
    (err) => {

        if (err) {
            return cb(err);
        }

        cb(null, knexTableDeltas);
    });
};


internals.diffColumns = (migrationGroups, joinTables, allTables, cb) => {

    // Now let's diff our model schemas with what's in the db
    // - convert model schema to knex schema
    // - compile the derived knex schema using knex's columnCompiler
    // 'columnCompiler' contains a universal set of types that it then
    // converts into specific db types

    const knexes = internals.dedupeKnexes(migrationGroups);

    const knexColumnDeltas = [];

    Items.parallel(knexes, (knex, knexNext) => {

        const knexColumnDeltaObject = {
            knex,
            migrationsDir: internals.getMigrationsDirForKnex(migrationGroups, knex),
            changes: []
        };

        // Gather the models for this knex

        const models = internals.getModelsForKnex(migrationGroups, knex, allTables);

        Items.parallel(Object.keys(models), (modelName, modelNext) => {

            const model = models[modelName];

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
                                modelDeltaObject.alter[key] = [db2ColumnCompiler(delta[key][0]), db2ColumnCompiler(delta[key][1])];
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
            })
            .catch((err) => {

                console.error(err);
                process.exit(1);
            });
        },
        (err) => {

            if (err) {
                console.error(err);
                process.exit(1);
            }
            knexColumnDeltas.push(knexColumnDeltaObject);
            knexNext();
        });
    },
    (err) => {

        // Items done!

        if (err) {
            console.error(err);
            process.exit(1);
        }

        return cb(null, knexColumnDeltas);
    });
};

internals.getColumnsForTable = (knex, tableName) => {

    let resolve;

    const p = new Promise((res, rej) => {

        resolve = res;
    });

    knex.table(tableName).columnInfo()
    .then((dbSchema) => {

        Object.keys(dbSchema).forEach((columnName) => {

            const columnSchema = dbSchema[columnName].type;
            delete columnSchema.defaultValue;
            dbSchema[columnName] = columnSchema;
        });

        resolve(dbSchema);
    });

    return p;
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
};

internals.getMigrationsDirForKnex = (migrationGroups, knex) => {

    return migrationGroups.find((mGroup) => {

        return mGroup.knex === knex;
    })
    .migrationsDir;
};

internals.diffJson = (d1, d2) => {

    const changesByKey = {
        create: [],
        alter: {},
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
                    changesByKey.alter[key] = [delta[key][0], delta[key][1]];
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

            const joinTableFrom = relation.join.through.from.split('.');
            const joinTableTo = relation.join.through.to.split('.');
            const relationExtra = relation.join.through.extra || (relation.join.through.modelClass && relation.join.through.modelClass.getJoiSchema()) || Joi.object({});

            let joiSchema;

            if (relationExtra) {

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
