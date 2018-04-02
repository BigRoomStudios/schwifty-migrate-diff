'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class BadMovie extends Model {

    static get tableName() {

        return 'BadMovie';
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
                        from: 'Bad_Person_Movie.personId',
                        to: 'Bad_Person_Movie.movieId',
                        modelClass: require('./Bad_Person_Movie')
                    },
                    to: 'BadMovie.id'
                }
            }
        };
    }
};
