'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Person_Movie');

};
