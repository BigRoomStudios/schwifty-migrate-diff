
const Inquirer = require('inquirer');
const Chalk = require('chalk');

module.exports = class MigrationAssistant {

    static askAboutAlters(tableChanges, drop, create, alter, cb) {

        const dropTypes = {};
        const createTypes = {};

        Object.keys(drop.columns).forEach((tableName) => {

            drop.columns[tableName].forEach((columnInfo) => {

                const colName = Object.keys(columnInfo)[0];
                const colType = columnInfo[colName];

                if(!dropTypes[colType]) {
                    dropTypes[colType] = [];
                }

                dropTypes[colType].push(`${tableName}->${colName}`);
            });
        });

        Object.keys(create.columns).forEach((tableName) => {

            create.columns[tableName].forEach((columnInfo) => {

                const colName = Object.keys(columnInfo)[0];
                const colType = columnInfo[colName];

                if(!createTypes[colType]) {
                    createTypes[colType] = [];
                }

                createTypes[colType].push(colName);
            });
        });

        const questions = [];

        Object.keys(dropTypes).forEach((colType) => {

            if(createTypes[colType]) {
                dropTypes[colType].forEach((colName) => {

                    questions.push({
                        type: 'list',
                        name: colName,
                        message: Chalk.bgGreen(` Did you change column "${colName}" to any of these? `),
                        choices: () => {
                            return [{name: '_', value: ''},{name: 'No, delete this column', value: null}].concat(createTypes[colType]);
                        }
                    });
                });

                // Schwifty Migration Assistant Header
                console.log('');
                console.log(' ' + Chalk.bold.inverse(' Schwifty Migration '));
                console.log('');

                Inquirer.prompt(questions).then((answers) => {

                    Object.keys(answers).forEach((tableColumnName) => {

                        if(answers[tableColumnName]) {

                            const tableName = tableColumnName.split('->')[0]
                            const changeFromColumnName = tableColumnName.split('->')[1];
                            const changeToColumnName = answers[tableColumnName];

                            dropTypes[colType].splice(dropTypes[colType].indexOf(tableColumnName), 1);
                            createTypes[colType].splice(createTypes[colType].indexOf(changeToColumnName), 1);

                            if(!alter.columns.name[tableName]) {
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

    static log(type, message) {

        switch(type) {

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
}
