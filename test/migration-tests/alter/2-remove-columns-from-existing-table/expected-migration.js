'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {

            table.dropColumn('age');
            table.dropColumn('lastName');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {

            table.integer('age');
            table.string('lastName');
        });
};
