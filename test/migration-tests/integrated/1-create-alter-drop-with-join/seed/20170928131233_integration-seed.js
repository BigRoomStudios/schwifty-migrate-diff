'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
        .createTable('Person', (table) => {

            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        })
        .createTable('Movie', (table) => {

            table.integer('id');
            table.string('title');
            table.string('subTitle');
        })
        .createTable('Dog_Movie', (table) => {

            table.integer('dogId');
            table.integer('movieId');
            table.integer('seeded-extra');
        });
};

exports.down = function (knex, Promise) {

    return knex.schema
        .dropTable('Person')
        .dropTable('Movie')
        .dropTable('Dog_Movie');
};
