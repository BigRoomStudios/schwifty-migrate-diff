'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Zombie extends Model {

    static get tableName() {

        return 'Zombie';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            firstName: Joi.string(),
            lastName: Joi.string(),

            age: Joi.number().integer(),

            address: Joi.object({
                street: Joi.string(),
                city: Joi.string(),
                zipCode: Joi.string()
            }),

            favoriteFood: Joi.string().default('Tasty brains')
        });
    }
};
