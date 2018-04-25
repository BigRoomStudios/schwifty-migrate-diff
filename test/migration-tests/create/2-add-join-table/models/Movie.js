'use strict';

const Joi = require('joi');
const Schwifty = require('schwifty');

module.exports = class Movie extends Schwifty.Model {

    static get tableName() {

        return 'Movie';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number().integer(),
            title: Joi.string(),
            subTitle: Joi.string()
        });
    }

    static get relationMappings() {

        return {
            actors: {
                relation: Schwifty.Model.ManyToManyRelation,
                modelClass: require('./Person'),
                join: {
                    from: 'Person.id',
                    through: {
                        from: 'Person_Movie.personId',
                        to: 'Person_Movie.movieId'
                    },
                    to: 'Movie.id'
                }
            }
        };
    }
};
