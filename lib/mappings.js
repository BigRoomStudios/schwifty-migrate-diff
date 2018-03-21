'use strict';

const Hoek = require('hoek');
const Joi = require('joi');

const internals = {};

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

        return Object.keys(maps.aliasMap).find((aliasType) => {

            return maps.aliasMap[aliasType].indexOf(type) !== -1;
        });
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

        Hoek.assert(badChildren.length === 0, `Joi Schema type(s) "${badChildren}" not supported. Please fix mappings.js`);

        return columns;
    },
    knex2JoiType: (knexType) => {

        const converted = maps.knexJoiMap[knexType];

        Hoek.assert(typeof converted !== 'undefined', `knexJoiMap doesn't support knex type "${knexType}". Please fix mappings.js`);

        return converted;
    },
    db2Knex: (dbType) => {

        const db2ColumnCompiler = convertFuncs.db2ColumnCompiler(dbType);

        // Anything exported from db2ColumnCompiler will work with columnCompiler2Knex
        const columnCompiler2Knex = convertFuncs.columnCompiler2Knex(db2ColumnCompiler);

        return columnCompiler2Knex;
    },
    db2ColumnCompiler: (dbType) => {

        const foundType = convertFuncs.getAliasVal(dbType);

        Hoek.assert(typeof foundType !== 'undefined', `Database type "${dbType}" not supported. Please fix mappings.js`);

        return foundType;
    },
    columnCompiler2Knex: (columnCompilerType) => {

        const foundType = maps.columnCompilerKnexMap[columnCompilerType];

        Hoek.assert(typeof foundType !== 'undefined', `Column Compiler type "${columnCompilerType}" not supported. Please fix mappings.js`);

        return foundType;
    },
    string2Joi: (str) => {

        if (str === 'numberInteger') {
            return Joi.number().integer();
        }
        return Joi[str]();
    }
};

module.exports = { maps, convertFuncs, ignoreColumns };
