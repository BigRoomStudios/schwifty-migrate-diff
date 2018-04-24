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
        .createTable('Zombie', (table) => {

            table.float('id');
            table.string('type');
            table.string('favoriteFood');
        })
        .createTable('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        })
        .createTable('Person_Zombie', (table) => {

            table.string('zombieId');
            table.string('personId');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Movie')
        .dropTable('Person')
        .dropTable('Zombie')
        .dropTable('Person_Movie')
        .dropTable('Person_Zombie');
};
