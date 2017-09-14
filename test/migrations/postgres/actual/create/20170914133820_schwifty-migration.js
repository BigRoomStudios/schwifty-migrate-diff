'use strict';

exports.up = function (knex, Promise) {

    return Promise.all([

        knex.schema.createTableIfNotExists('Dog', function(table) {

            table.integer('id');
            table.string('favoriteToy');
            table.string('name');
            table.integer('ownerId');
        }),

        knex.schema.createTableIfNotExists('Movie', function(table) {

            table.integer('id');
            table.string('title');
            table.string('subTitle');
        }),

        knex.schema.createTableIfNotExists('Person', function(table) {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
        }),

        knex.schema.createTableIfNotExists('Zombie', function(table) {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
            table.string('favoriteFood');
        }),



        knex.schema.createTableIfNotExists('Person_Movie', function(table) {

            table.integer('personId');
            table.integer('movieId');
        }),


    ])
};

exports.down = function (knex, Promise) {

    return Promise.all([
        knex.schema.dropTable('Dog'),
        knex.schema.dropTable('Movie'),
        knex.schema.dropTable('Person'),
        knex.schema.dropTable('Zombie'),
    ])
};
