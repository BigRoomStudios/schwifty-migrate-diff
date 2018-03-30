'use strict';

const Joi = require('joi');

const internals = {};

const multiReturn = (condition, errMsg, val) => {

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

const maps = {
    joiKnexMap: {
        string        : 'string',
        boolean       : 'boolean',
        date          : 'date',
        binary        : 'binary',
        number        : 'float',
        numberInteger : 'integer', // numberInteger represents Joi.number().integer()
        array         : 'json',
        object        : 'json',
        any           : 'string'
    },
    knexJoiMap: {
        string        : 'string',
        boolean       : 'boolean',
        date          : 'date',
        binary        : 'binary',
        float         : 'number',
        integer       : 'numberInteger', // numberInteger represents Joi.number().integer()
        json          : 'object' // or this could be an array... TODO
    },
    aliasMap: {

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
    },
    columnCompilerKnexMap: {
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
        tinyint   : 'integer',
        decimal   : 'float',
        blob      : 'binary'
    }
};

const ignoreColumns = [
    'tsvector',
    'tsv'
];

const convertFuncs = {
    getAliasVal: (type) => {

        const foundAlias = Object.keys(maps.aliasMap).find((aliasType) => {

            return maps.aliasMap[aliasType].indexOf(type) !== -1;
        });

        return multiReturn(
            typeof foundAlias === 'undefined',
            `Alias not found for ${type}`,
            foundAlias
        );
    },
    joi2Knex: (joiSchema) => {

        const joiSchemaDescription = joiSchema.describe();

        const badChildren = [];

        const columns = Object.keys(joiSchemaDescription.children).reduce((collector, schemaKey) => {

            const child = joiSchemaDescription.children[schemaKey];
            const childType = child.type;

            let columnType;

            switch (childType) {

                case 'number':

                    const rulesIncludeInteger = child.rules && child.rules.some((rule) => rule.name === 'integer');

                    if (rulesIncludeInteger) {
                        columnType = maps.joiKnexMap.numberInteger;
                    }
                    else {
                        columnType = maps.joiKnexMap[childType];
                    }
                    break;
                default:
                    columnType = maps.joiKnexMap[childType];
            }

            if (!columnType) {
                badChildren.push(childType);
                return collector;
            }

            collector[schemaKey] = columnType;
            return collector;

        }, {});

        return multiReturn(
            badChildren.length > 0,
            `Joi Schema type(s) "${badChildren}" not supported.`,
            columns
        );
    },
    knex2JoiType: (knexType) => {

        const converted = maps.knexJoiMap[knexType];

        return multiReturn(
            typeof converted === 'undefined',
            `knexJoiMap doesn't support knex type "${knexType}".`,
            converted
        );
    },
    db2Knex: (dbType) => {

        const [ccErr, db2ColumnCompiler] = convertFuncs.db2ColumnCompiler(dbType);

        if (ccErr) {
            return [ccErr, null];
        }

        // Anything exported from db2ColumnCompiler will work with columnCompiler2Knex
        const [knexErr, columnCompiler2Knex] = convertFuncs.columnCompiler2Knex(db2ColumnCompiler);

        return multiReturn(
            !!knexErr,
            knexErr,
            columnCompiler2Knex
        );
    },
    db2ColumnCompiler: (dbType) => {

        const [err, foundType] = convertFuncs.getAliasVal(dbType);

        return multiReturn(
            typeof foundType === 'undefined',
            err,
            foundType
        );
    },
    columnCompiler2Knex: (columnCompilerType) => {

        const foundType = maps.columnCompilerKnexMap[columnCompilerType];

        return multiReturn(
            typeof foundType === 'undefined',
            `Column Compiler type "${columnCompilerType}" not supported.`,
            foundType
        );
    },
    string2Joi: (str) => {

        if (str === 'numberInteger') {
            return Joi.number().integer();
        }
        return Joi[str]();
    }
};

module.exports = { maps, convertFuncs, ignoreColumns };
