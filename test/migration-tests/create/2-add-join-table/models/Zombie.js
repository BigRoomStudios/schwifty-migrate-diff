'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Zombie extends Model {

    static get tableName() {

        return 'Zombie';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            type: Joi.string().default('carnivore'),
            favoriteFood: Joi.string().default('Tasty brains')
        });
    }

    static get relationMappings() {

        return {
            oldFriends: {
                relation: Model.ManyToManyRelation,
                modelClass: require('./Person'),
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
