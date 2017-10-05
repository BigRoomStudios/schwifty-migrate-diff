'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.boolean('firstName').alter();
            table.number('lastName').alter();
    })

};

exports.down = (knex, Promise) => {

    return knex.schema
        .alterTable('Person', (table) => {
            table.string('firstName').alter();
            table.string('lastName').alter();
    })

};
