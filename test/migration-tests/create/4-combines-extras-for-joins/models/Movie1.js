'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Movie1 extends Model {

    static get tableName() {

        return 'Movie1';
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
                modelClass: require('./Person1'),
                join: {
                    from: 'Person1.id',
                    through: {
                        from: 'Person_Movie1.personId',
                        extra: ['one-extra', 'two-extra'],
                        to: 'Person_Movie1.movieId'
                    },
                    to: 'Movie1.id'
                }
            }
        };
    }
};
