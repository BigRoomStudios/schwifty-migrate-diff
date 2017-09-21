'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Person_Movie extends Model {

    static get tableName() {

        return 'Person_Movie';
    }

    static get joiSchema() {

        return Joi.object({
            personId: Joi.string(),
            movieId: Joi.string()
        });
    }
};
