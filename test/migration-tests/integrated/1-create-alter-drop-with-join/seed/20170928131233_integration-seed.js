'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
        .createTableIfNotExists('Person', (table) => {

            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        })
        .createTableIfNotExists('Movie', (table) => {

            table.integer('id');
            table.string('title');
            table.string('subTitle');
        })
        .createTableIfNotExists('Dog_Movie', (table) => {

            table.integer('dogId');
            table.integer('movieId');
        });

};

exports.down = function (knex, Promise) {

    return knex.schema
        .dropTable('Person')
        .dropTable('Movie');

};
