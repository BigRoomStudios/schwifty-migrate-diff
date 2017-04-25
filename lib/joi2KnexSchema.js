'use strict';

const Hoek = require('hoek');

const internals = {};

exports.joiKnexMap = {
    string      : 'string',
    boolean     : 'boolean',
    date        : 'date',
    binary      : 'binary',
    number      : 'integer',
    array       : 'json',
    object      : 'json',
    // alternatives: null,
    any         : 'string'
};

exports.convert = (joiSchema) => {

    const joiSchemaDescription = joiSchema.describe();

    const columns = Object.keys(joiSchemaDescription.children).reduce((collector, schemaKey) => {

        const childType = joiSchemaDescription.children[schemaKey].type;
        const columnType = exports.joiKnexMap[childType];

        Hoek.assert(columnType, 'Schema type ' + childType + ' not supported');

        collector[schemaKey] = columnType;
        return collector;

    }, {});

    return columns;
};
