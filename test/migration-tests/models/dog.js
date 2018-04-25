'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;
const TestModels = require('./');

module.exports = class Dog extends Model {

    static get tableName() {

        return 'Dog';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            favoriteToy: Joi.string(),
            name: Joi.string(),
            ownerId: Joi.number().integer()
        });
    }

    static get relationMappings() {

        return {
            owner: {
                relation: Model.BelongsToOneRelation,
                modelClass: TestModels.Person,
                join: {
                    from: 'Person.id',
                    to: 'Dog.ownerId'
                }
            }
        };
    }
};
