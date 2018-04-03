'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class BadZombie extends Model {

    static get tableName() {

        return 'BadZombie';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            firstName: Joi.string(),
            lastName: Joi.string(),

            age: Joi.number().integer(),

            address: Joi.object({
                street: Joi.string(),
                city: Joi.string(),
                zipCode: Joi.string()
            }),

            favoriteFood: Joi.alternatives([
                Joi.string(),
                Joi.object()
            ])
        });
    }
};
