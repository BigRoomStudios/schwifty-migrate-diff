'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.string('hometown');
        })

};

exports.down = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.dropColumn('hometown');
        })

};
