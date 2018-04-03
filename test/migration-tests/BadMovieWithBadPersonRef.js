'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class BadMovieWithBadPersonRef extends Model {

    static get tableName() {

        return 'BadMovieWithBadPersonRef';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            title: Joi.string(),
            subTitle: Joi.string(),
            sequel: Joi.alternatives([
                Joi.string(),
                Joi.object()
            ])
        });
    }

    static get relationMappings() {

        return {
            actors: {
                relation: Model.ManyToManyRelation,
                modelClass: require('./BadPerson'),
                join: {
                    from: 'BadPerson.id',
                    through: {
                        from: 'Person_Movie.personId',
                        to: 'Person_Movie.movieId',
                        modelClass: require('./Person_Movie')
                    },
                    to: 'BadMovieWithBadPersonRef.id'
                }
            }
        };
    }
};
