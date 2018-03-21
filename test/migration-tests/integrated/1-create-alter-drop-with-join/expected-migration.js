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
            table.float('firstName').alter();
            table.dropColumn('lastName');
        })
        .alterTable('Dog_Movie', (table) => {

            table.string('one-extra');
            table.string('two-extra');
            table.integer('movieId').alter();
        });

};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Dog')
        .dropTable('Person_Movie')
        .alterTable('Person', (table) => {

            table.dropColumn('age');
            table.dropColumn('address');
            table.string('firstName').alter();
            table.string('lastName');
        })
        .alterTable('Dog_Movie', (table) => {

            table.dropColumn('one-extra');
            table.dropColumn('two-extra');
            table.string('movieId').alter();
        });

};
