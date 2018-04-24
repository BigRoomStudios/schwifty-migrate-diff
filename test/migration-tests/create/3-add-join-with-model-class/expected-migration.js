'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTable('Movie', (table) => {

            table.integer('id');
            table.string('title');
            table.string('subTitle');
        })
        .createTable('Person', (table) => {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
        })
        .createTable('Person_Movie', (table) => {

            table.integer('personId');
            table.integer('movieId');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Movie')
        .dropTable('Person')
        .dropTable('Person_Movie');
};
