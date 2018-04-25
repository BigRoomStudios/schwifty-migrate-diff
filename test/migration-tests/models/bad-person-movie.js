'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Person_Movie extends Model {

    static get tableName() {

        return 'Bad_Person_Movie';
    }

    static get joiSchema() {

        return Joi.object({
            personId: Joi.number(),
            movieId: Joi.number(),

            // This Joi is unsupported, these must be the same type
            badProp: Joi.alternatives([
                Joi.string(),
                Joi.object()
            ])
        });
    }
};
