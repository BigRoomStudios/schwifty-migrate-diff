'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Person', (table) => {
            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
        })

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Person')

};
