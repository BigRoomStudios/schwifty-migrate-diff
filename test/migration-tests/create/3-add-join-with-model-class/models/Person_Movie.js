'use strict';

const Joi = require('joi');
const Schwifty = require('schwifty');

module.exports = class Person_Movie extends Schwifty.Model {

    static get tableName() {

        return 'Person_Movie';
    }

    static get joiSchema() {

        return Joi.object({
            personId: Joi.number().integer(),
            movieId: Joi.number().integer()
        });
    }
};
