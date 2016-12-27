'use strict';

const Joi = require('joi');

exports.plugin = Joi.object({

    dir: Joi.string(),
    mode: Joi.string().allow('create', 'alter')
});
