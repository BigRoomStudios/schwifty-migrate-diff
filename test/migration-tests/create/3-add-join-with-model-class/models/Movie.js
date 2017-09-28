'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Movie extends Model {

    static get tableName() {

        return 'Movie';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            title: Joi.string(),
            subTitle: Joi.string()
        });
    }

    static get relationMappings() {

        return {
            actors: {
                relation: Model.ManyToManyRelation,
                modelClass: require('./Person'),
                join: {
                    from: 'Person.id',
                    through: {
                        from: 'Person_Movie.personId',
                        to: 'Person_Movie.movieId',
                        modelClass: require('./Person_Movie')
                    },
                    to: 'Movie.id'
                }
            }
        };
    }
};
