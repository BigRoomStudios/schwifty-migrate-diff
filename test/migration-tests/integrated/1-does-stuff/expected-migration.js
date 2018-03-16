'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Dog', (table) => {

            table.integer('id');
            table.string('favoriteToy');
            table.string('name');
            table.integer('ownerId');
        })
        .createTableIfNotExists('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        })
        .alterTable('Person', (table) => {

            table.integer('age');
            table.json('address');
            table.dropColumn('lastName');
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Dog')
        .dropTable('Person_Movie')
        .alterTable('Person', (table) => {

            table.dropColumn('age');
            table.dropColumn('address');
            table.string('lastName');
        });

};
