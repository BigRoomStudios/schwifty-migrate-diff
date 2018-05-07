'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

// This model intended for use with test 'Suppresses alter and drop actions if mode is not set to "alter"'
// Any alters should be ignored, this migration will be run with `mode: 'create'`

module.exports = class AlterPerson extends Model {

    static get tableName() {

        return 'Person';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            firstName: Joi.number(), // It's the future, all firstNames are numbers now // This will be ignored

            age: Joi.number().integer(),

            address: Joi.object({
                street: Joi.string(),
                city: Joi.string(),
                zipCode: Joi.string()
            }),

            hometown: Joi.string(),
            weirdo_column: Joi.string() // This conflicts with an unsupported (skipped) weirdo_column in the db
        });
    }
};
