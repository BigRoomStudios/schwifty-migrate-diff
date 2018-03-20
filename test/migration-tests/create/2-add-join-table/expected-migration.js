'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Movie', (table) => {

            table.integer('id');
            table.string('title');
            table.string('subTitle');
        })
        .createTableIfNotExists('Person', (table) => {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
        })
        .createTableIfNotExists('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Movie')
        .dropTable('Person')
        .dropTable('Person_Movie');

};
