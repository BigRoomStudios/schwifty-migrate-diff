'use strict';

const getDialect = (knex) => {

    return (knex && knex.client && knex.client.dialect) || null;
};

const isPostgres = (knex) => {

    return getDialect(knex) === 'postgresql';
};

const isMySql = (knex) => {

    return getDialect(knex) === 'mysql';
};

const isSqlite = (knex) => {

    return getDialect(knex) === 'sqlite3';
};

const isMsSql = (knex) => {

    return getDialect(knex) === 'mssql';
};

module.exports = {
    getDialect,
    isPostgres,
    isMySql,
    isSqlite,
    isMsSql
};
