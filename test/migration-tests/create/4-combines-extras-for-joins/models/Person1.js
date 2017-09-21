'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Person1 extends Model {

    static get tableName() {

        return 'Person1';
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
            })
        });
    }

    static get relationMappings() {

        return {
            movies: {
                relation: Model.ManyToManyRelation,
                modelClass: require('./Movie1'),
                join: {
                    from: 'Movie1.id',
                    through: {
                        from: 'Person_Movie1.movieId',
                        extra: ['three-extra', 'four-extra'],
                        to: 'Person_Movie1.personId'
                    },
                    to: 'Person1.id'
                }
            }
        };
    }
};
