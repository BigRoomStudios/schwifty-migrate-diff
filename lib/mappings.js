'use strict';

const Hoek = require('hoek');

const internals = {};

const maps = {
    joiKnexMap: {
        string      : 'string',
        boolean     : 'boolean',
        date        : 'date',
        binary      : 'binary',
        number      : 'float',
        array       : 'json',
        object      : 'json',
        any         : 'string'
    },
    columnCompilerAliasMap: {

        // Aliases across different database types

        varchar   : ['character varying', 'varchar'],
        boolean   : ['boolean'],
        integer   : ['integer', 'int'],
        date      : ['date', 'datetime', 'timestamp with time zone'],
        timestamp : ['timestamp'],
        time      : ['time'],
        json      : ['json'],
        text      : ['text'],
        float     : ['float'],
        bigint    : ['bigint'],
        tinyint   : ['tinyint'],
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
        float     : 'number',
        bigint    : 'number',
        tinyint   : 'number',
        decimal   : 'number',
        blob      : 'binary'
    }
};

const ignoreColumns = [
    'tsvector',
    'tsv'
];

const convertFuncs = {
    joi2Knex: (joiSchema) => {

        const joiSchemaDescription = joiSchema.describe();

        const columns = Object.keys(joiSchemaDescription.children).reduce((collector, schemaKey) => {

            const childType = joiSchemaDescription.children[schemaKey].type;
            const columnType = maps.joiKnexMap[childType];

            // Rage quit if there's a column type not in the mappings list
            Hoek.assert(columnType, `Schema type "${childType}" not supported. Please fix mappings.js`);

            collector[schemaKey] = columnType;
            return collector;

        }, {});

        return columns;
    },
    db2Knex: (dbType) => {

        return convertFuncs.columnCompiler2Knex(convertFuncs.db2ColumnCompiler(dbType));
    },
    db2ColumnCompiler: (dbType) => {

        const foundType = Object.keys(maps.columnCompilerAliasMap).find((columnCompilerType) => {

            return maps.columnCompilerAliasMap[columnCompilerType].indexOf(dbType) !== -1;
        });

        // Rage quit if there's a column type not in the mappings list
        Hoek.assert(foundType, `Database type "${dbType}" not supported. Please fix mappings.js`);

        return foundType;
    },
    columnCompiler2Knex: (columnCompilerType) => {

        const foundType = maps.columnCompilerKnexMap[columnCompilerType];

        // Rage quit if there's a column type not in the mappings list
        Hoek.assert(foundType, `Column Compiler type "${columnCompilerType}" not supported. Please fix mappings.js`);

        return foundType;
    }
};

module.exports = { maps, convertFuncs, ignoreColumns };
