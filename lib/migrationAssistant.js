
const Inquirer = require('inquirer');

const BottomBar = new Inquirer.ui.BottomBar();
const Prompt = Inquirer.createPromptModule();

module.exports = class MigrationAssistant {

    constructor() {

        BottomBar.log.write('Migration Assistant');
    }

    static askAboutNameChange(tableToChange, choices) {

        //
    }

    static logAction(action) {


    }
}
