'use strict';

const Inquirer = require('inquirer');
const Chalk = require('chalk');
const Items = require('items');

module.exports = class MigrationAssistant {

    static showHeader() {

        // Schwifty Migration Assistant Header
        console.log('');
        console.log(' ' + Chalk.bold.inverse(' Schwifty Migration '));
        console.log('');
    }

    static showPrompt(questions, cb) {

        this.showHeader();
        Inquirer.prompt(questions).then((answers) => {

            cb(null, answers);
        })
        .catch((err) => {

            throw new Error(err);
        });
    }

    static checkTablesForAlters(drop, create, alter, cb) {

        const self = this;

        if (drop.tables.length > 0 && create.tables.length > 0) {

            const tableQuestions = [];

            drop.tables.forEach((tableNameToDrop) => {

                tableQuestions.push({
                    type: 'list',
                    name: tableNameToDrop,
                    message: Chalk.bgGreen(` Did you change table "${tableNameToDrop}" to any of these? `),
                    choices: () => {

                        return [{ name: '_', value: '' },{ name: 'No, drop this table', value: null }].concat(create.tables.map((createTableName) => {

                            return { name: createTableName, value: createTableName };
                        }));
                    }
                });
            });

            self.showPrompt(tableQuestions, (err, answers) => {

                Object.keys(answers).forEach((dropTableName) => {

                    if (answers[dropTableName]) {

                        drop.tables.splice(drop.tables.indexOf(dropTableName), 1);
                        create.tables.splice(create.tables.indexOf(answers[dropTableName]), 1);

                        alter.tables.push([dropTableName, answers[dropTableName]]);
                    }
                });

                cb(null, { drop, create, alter });
            });
        }
    }

    static checkColumnsForAlters(drop, create, alter, cb) {

        const dropTypes = {};
        const createTypes = {};

        Object.keys(drop.columns).forEach((tableName) => {

            drop.columns[tableName].forEach((columnInfo) => {

                const colName = Object.keys(columnInfo)[0];
                const colType = columnInfo[colName];

                if (!dropTypes[colType]) {
                    dropTypes[colType] = [];
                }

                dropTypes[colType].push(`${tableName}->${colName}`);
            });
        });

        Object.keys(create.columns).forEach((tableName) => {

            create.columns[tableName].forEach((columnInfo) => {

                const colName = Object.keys(columnInfo)[0];
                const colType = columnInfo[colName];

                if (!createTypes[colType]) {
                    createTypes[colType] = [];
                }

                createTypes[colType].push(colName);
            });
        });

        const self = this;
        const columnQuestions = [];

        Object.keys(dropTypes).forEach((colType) => {

            if (createTypes[colType]) {
                dropTypes[colType].forEach((colName) => {

                    columnQuestions.push({
                        type: 'list',
                        name: colName,
                        message: Chalk.bgGreen(` Did you change column "${colName}" to any of these? `),
                        choices: () => {

                            return [{ name: '_', value: '' },{ name: 'No, drop this column', value: null }].concat(createTypes[colType]);
                        }
                    });
                });

                self.showPrompt(columnQuestions, (err, answers) => {

                    Object.keys(answers).forEach((tableColumnName) => {

                        if (answers[tableColumnName]) {

                            /*
                                If there's an answer, that means someone wants to alter a table / column
                                so remove from the drop / create objects.
                            */

                            const tableName = tableColumnName.split('->')[0];
                            const changeFromColumnName = tableColumnName.split('->')[1];
                            const changeToColumnName = answers[tableColumnName];

                            dropTypes[colType].splice(dropTypes[colType].indexOf(tableColumnName), 1);
                            createTypes[colType].splice(createTypes[colType].indexOf(changeToColumnName), 1);

                            const dropIndex = drop.columns[tableName].findIndex((columnToDrop) => {

                                return Object.keys(columnToDrop)[0] === changeFromColumnName;
                            });

                            drop.columns[tableName].splice(dropIndex, 1);
                            if (drop.columns[tableName].length === 0) {
                                delete drop.columns[tableName];
                            }


                            const createIndex = create.columns[tableName].findIndex((columnToCreate) => {

                                return Object.keys(columnToCreate)[0] === changeToColumnName;
                            });

                            create.columns[tableName].splice(createIndex, 1);
                            if (create.columns[tableName].length === 0) {
                                delete create.columns[tableName];
                            }


                            if (!alter.columns.name[tableName]) {
                                alter.columns.name[tableName] = [];
                            }

                            alter.columns.name[tableName].push([changeFromColumnName, changeToColumnName]);
                        }
                    });

                    cb(null, { drop, create, alter });
                });
            }
        });
    }

    static askAboutAlters(tableChanges, drop, create, alter, cb) {

        const checkAlterFuncs = [
            this.checkTablesForAlters.bind(this),
            this.checkColumnsForAlters.bind(this)
        ];

        Items.serial(checkAlterFuncs, (checkFunc, next) => {

            checkFunc(drop, create, alter, (err, res) => {

                if (err) {
                    throw new Error(err);
                }

                drop = res.drop;
                create = res.create;
                alter = res.alter;

                next(err);
            });
        },
        (err) => {

            // All done
            cb(err, { drop, create, alter });
        });
    }

    log(type, message) {

        switch (type) {

            case 'createTable':

                console.log(Chalk.bold.green('Created Table "' + message + '"'));
                break;

            case 'alterTable':

                console.log(Chalk.bold.yellow('Altered Table "' + message + '"'));
                break;

            case 'dropTable':

                console.log(Chalk.bold.red('Dropped Table "' + message + '"'));
                break;

            case 'createColumn':

                console.log(Chalk.bold.green('Created Column "' + message + '"'));
                break;

            case 'alterColumn':

                console.log(Chalk.bold.yellow('Altered Column "' + message + '"'));
                break;

            case 'dropColumn':

                console.log(Chalk.bold.red('Dropped Column "' + message + '"'));
                break;
        }
    }
};
