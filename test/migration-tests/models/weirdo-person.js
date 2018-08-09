'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class WeirdoPerson extends Model {

    static get tableName() {

        return 'Person';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            firstName: Joi.number(),

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
