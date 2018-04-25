'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;
const TestModels = require('./');

module.exports = class BadMovie extends Model {

    static get tableName() {

        return 'DoubleBadMovie';
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
                modelClass: TestModels.Person,
                join: {
                    from: 'BadPerson.id',
                    through: {
                        from: 'Double_Bad_Person_Movie.personId',
                        to: 'Double_Bad_Person_Movie.movieId',
                        modelClass: TestModels.Double_Bad_Person_Movie
                    },
                    to: 'DoubleBadMovie.id'
                }
            }
        };
    }
};
