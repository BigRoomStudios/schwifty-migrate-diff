'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;

module.exports = class Weirdo_Person_Movie extends Model {

    static get tableName() {

        return 'Person_Movie';
    }

    static get joiSchema() {

        return Joi.object({
            personId: Joi.number(),
            movieId: Joi.number(),
            weirdo_column: Joi.string() // This conflicts with an unsupported (skipped) weirdo_column in the db
        });
    }
};
