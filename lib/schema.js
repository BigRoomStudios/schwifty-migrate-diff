'use strict';

const Joi = require('joi');

exports.options = Joi.object({

    migrationGroups: Joi.array().items(
        Joi.object({
            models: Joi.array().items(Joi.func()), // Array of ES6 Classes
            migrationsDir: Joi.string().required(),
            knex: Joi.func().required() // ES6 Class
        })
    ),
    mode: Joi.string().allow('create', 'alter', 'test').optional()
});
