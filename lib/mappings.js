'use strict';

const Joi = require('joi');

const internals = {};

exports.maps = {};
exports.convertFuncs = {};

exports.maps.joiKnexMap = {
    string        : 'string',
    boolean       : 'boolean',
    date          : 'date',
    binary        : 'binary',
    number        : 'float',
    numberInteger : 'integer', // numberInteger represents Joi.number().integer()
    array         : 'json',
    object        : 'json',
    any           : 'string'
};

exports.maps.knexJoiMap = {
    string        : 'string',
    boolean       : 'boolean',
    date          : 'date',
    timestamp     : 'date',
    binary        : 'binary',
    float         : 'number',
    integer       : 'numberInteger', // numberInteger represents Joi.number().integer()
    json          : 'object' // or this could be an array... TODO
};

exports.maps.aliasMap = {
    // Aliases across different database types
    varchar   : ['character varying', 'varchar'],
    boolean   : ['boolean', 'tinyint'],
    integer   : ['integer', 'int'],
    date      : ['date', 'datetime', 'timestamp with time zone'],
    timestamp : ['timestamp'],
    time      : ['time'],
    json      : ['json'],
    text      : ['text'],
    float     : ['float', 'real'],
    bigint    : ['bigint'],
    decimal   : ['decimal'],
    blob      : ['blob']
};

exports.maps.columnCompilerKnexMap = {
    varchar   : 'string',
    boolean   : 'boolean',
    integer   : 'integer',
    date      : 'date',
    timestamp : 'timestamp',
    time      : 'timestamp',
    json      : 'json',
    text      : 'string',
    float     : 'float',
    bigint    : 'integer',
    decimal   : 'float',
    blob      : 'binary'
};

exports.convertFuncs.getAliasVal = (type, augmentError) => {

    const foundAlias = Object.keys(exports.maps.aliasMap).find((aliasType) => {

        return exports.maps.aliasMap[aliasType].indexOf(type) !== -1;
    });

    return internals.multiReturn(
        typeof foundAlias === 'undefined',
        `Alias not found for ${type}${augmentError || ''}.`,
        foundAlias
    );
};

exports.convertFuncs.joi2Knex = (joiSchema, augmentError) => {

    const describeChildren = joiSchema.describe().children;

    const badChildren = [];

    const columns = Object.keys(describeChildren).reduce((collector, schemaKey) => {

        const child = describeChildren[schemaKey];
        const type = exports.convertFuncs.stringFromJoiDescribeChild(child);
        const columnType = exports.maps.joiKnexMap[type];

        if (!columnType) {
            badChildren.push(type);
            return collector;
        }

        collector[schemaKey] = columnType;
        return collector;
    }, {});

    return internals.multiReturn(
        badChildren.length > 0,
        `Joi Schema type(s) "${badChildren.join(', ')}" not supported${augmentError || ''}.`,
        columns
    );
};

exports.convertFuncs.knex2JoiType = (knexType) => {

    const converted = exports.maps.knexJoiMap[knexType];

    return internals.multiReturn(
        typeof converted === 'undefined',
        `knexJoiMap doesn't support knex type "${knexType}".`,
        converted
    );
};

exports.convertFuncs.db2Knex = (dbType) => {

    const [ccErr, db2ColumnCompiler] = exports.convertFuncs.db2ColumnCompiler(dbType);

    if (ccErr) {
        return [ccErr, null];
    }

    // Anything exported from db2ColumnCompiler will work with columnCompiler2Knex
    const [knexErr, columnCompiler2Knex] = exports.convertFuncs.columnCompiler2Knex(db2ColumnCompiler);

    return internals.multiReturn(
        !!knexErr,
        knexErr,
        columnCompiler2Knex
    );
};

exports.convertFuncs.db2ColumnCompiler = (dbType, augmentError) => {

    const [err, foundType] = exports.convertFuncs.getAliasVal(dbType, augmentError);

    return internals.multiReturn(
        !!err,
        err,
        foundType
    );
};

exports.convertFuncs.columnCompiler2Knex = (columnCompilerType) => {

    const foundType = exports.maps.columnCompilerKnexMap[columnCompilerType];

    return internals.multiReturn(
        typeof foundType === 'undefined',
        `Column Compiler type "${columnCompilerType}" not supported.`,
        foundType
    );
};

exports.convertFuncs.string2Joi = (str) => {

    if (str === 'numberInteger') {
        return Joi.number().integer();
    }
    return Joi[str]();
};

exports.convertFuncs.stringFromJoiDescribeChild = (child) => {

    const { type } = child;

    switch (type) {

        case 'number':

            const rulesIncludeInteger = child.rules && child.rules.some((rule) => rule.name === 'integer');

            if (rulesIncludeInteger) {
                return 'numberInteger';
            }
            return type;

        default:
            return type;
    }
};

internals.multiReturn = (condition, errMsg, val) => {

    if (condition) {
        let err;
        if (errMsg instanceof Error) {
            err = errMsg;
        }
        else {
            err = new Error(errMsg);
        }
        return [err, null];
    }

    return [null, val];
};
