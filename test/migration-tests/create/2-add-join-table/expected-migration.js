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
        .createTableIfNotExists('Zombie', (table) => {

            table.float('id');
            table.string('type');
            table.string('favoriteFood');
        })
        .createTableIfNotExists('Person_Movie', (table) => {

            table.string('personId');
            table.string('movieId');
        })
        .createTableIfNotExists('Person_Zombie', (table) => {

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
