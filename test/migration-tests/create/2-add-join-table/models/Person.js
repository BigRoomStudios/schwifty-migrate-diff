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
            firstName: Joi.string(),
            lastName: Joi.string(),

            age: Joi.number().integer(),

            address: Joi.object({
                street: Joi.string(),
                city: Joi.string(),
                zipCode: Joi.string()
            })
        });
    }

    static get relationMappings() {

        return {
            newFriends: {
                relation: Schwifty.Model.ManyToManyRelation,
                modelClass: require('./Zombie'),
                join: {
                    from: 'Zombie.id',
                    through: {
                        from: 'Person_Zombie.zombieId',
                        to: 'Person_Zombie.personId'
                    },
                    to: 'Person.id'
                }
            }
        };
    }
};
