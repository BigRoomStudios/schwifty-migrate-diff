'use strict';

const Joi = require('joi');
const Schwifty = require('schwifty');

module.exports = class Zombie extends Schwifty.Model {

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
                relation: Schwifty.Model.ManyToManyRelation,
                modelClass: require('./Person'),
                join: {
                    from: 'Person.id',
                    through: {
                        from: 'Person_Zombie.personId',
                        to: 'Person_Zombie.zombieId'
                    },
                    to: 'Zombie.id'
                }
            }
        };
    }
};
