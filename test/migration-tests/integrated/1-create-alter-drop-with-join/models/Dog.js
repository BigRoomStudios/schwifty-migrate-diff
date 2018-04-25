'use strict';

const Joi = require('joi');
const Schwifty = require('schwifty');

module.exports = class Dog extends Schwifty.Model {

    static get tableName() {

        return 'Dog';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            favoriteToy: Joi.string(),
            name: Joi.string(),
            ownerId: Joi.number().integer()
        });
    }

    static get relationMappings() {

        return {
            owner: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: require('./Person'),
                join: {
                    from: 'Person.id',
                    to: 'Dog.ownerId'
                }
            }
        };
    }
};
