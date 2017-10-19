'use strict';

const Joi = require('joi');

exports.options = Joi.object({
    models: Joi.array().items(Joi.func().class()),
    migrationsDir: Joi.string().required(),
    knex: Joi.func().required(),
    mode: Joi.string().allow('create', 'alter', 'test').default('create'),
    migrationName: Joi.string().default('schwifty-migration')
});
