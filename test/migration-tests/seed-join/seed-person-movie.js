'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTable('Person', (table) => {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
        })
        .createTable('Movie', (table) => {

            table.float('id');
            table.string('title');
            table.string('subTitle');
        })
        .createTable('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Person')
        .dropTable('Movie')
        .dropTable('Person_Movie');
};
