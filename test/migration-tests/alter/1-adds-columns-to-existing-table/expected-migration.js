'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.integer('age');
            table.json('address');
    })

};

exports.down = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.dropColumn('age');
            table.dropColumn('address');
    })

};
