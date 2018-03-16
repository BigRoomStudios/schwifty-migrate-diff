'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Person', (table) => {

            table.json('address');
            table.integer('age');
            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Person');

};
