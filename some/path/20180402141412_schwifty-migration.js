'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Dog', (table) => {

            table.float('id');
            table.string('favoriteToy');
            table.string('name');
            table.integer('ownerId');
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Dog');

};
