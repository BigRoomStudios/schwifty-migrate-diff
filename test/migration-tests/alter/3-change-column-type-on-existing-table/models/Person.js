'use strict';

const Joi = require('joi');
const Schwifty = require('schwifty');

module.exports = class Person extends Schwifty.Model {

    static get tableName() {

        return 'Person';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            firstName: Joi.boolean(),
            lastName: Joi.number(),
            age: Joi.number().integer(),

            address: Joi.object({
                street: Joi.string(),
                city: Joi.string(),
                zipCode: Joi.string()
            })
        });
    }
};
