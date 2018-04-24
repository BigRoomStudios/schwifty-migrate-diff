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

            table.string('one-extra');
            table.string('two-extra');
            table.string('personId');
            table.string('movieId');
            table.string('three-extra');
            table.string('four-extra');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Movie')
        .dropTable('Person')
        .dropTable('Person_Movie');
};
