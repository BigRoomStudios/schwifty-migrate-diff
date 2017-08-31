'use strict';

const Hoek = require('hoek');

const internals = {};

const maps = {
    joiKnexMap: {
        string      : 'string',
        boolean     : 'boolean',
        date        : 'date',
        binary      : 'binary',
        number      : 'integer',
        array       : 'json',
        object      : 'json',
        // alternatives: null,
        any         : 'string'
    },
    columnCompilerAliasMap: {
        varchar   : ['character varying', 'varchar'],
        boolean   : ['boolean'],
        integer   : ['integer'],
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
            Hoek.assert(columnType, `Schema type "${childType}" not supported`);

            collector[schemaKey] = columnType;
            return collector;

        }, {});

        return columns;
    },
    db2ColumnCompiler: (dbType) => {

        const foundType = Object.keys(maps.columnCompilerAliasMap).find((columnCompilerType) => {

            return maps.columnCompilerAliasMap[columnCompilerType].indexOf(dbType) !== -1;
        });

        // Rage quit if there's a column type not in the mappings list
        Hoek.assert(foundType, `Database type "${dbType}" not supported`);

        return foundType;
    }
}

module.exports = { maps, convertFuncs, ignoreColumns };
