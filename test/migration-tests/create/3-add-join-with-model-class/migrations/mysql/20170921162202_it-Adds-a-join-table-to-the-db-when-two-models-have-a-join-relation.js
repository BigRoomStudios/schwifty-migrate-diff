'use strict';

exports.up = function (knex, Promise) {

    return Promise.all([
        knex.schema.createTableIfNotExists('Movie', function(table) {
            table.integer('id');
            table.string('subTitle');
            table.string('title');
        }),
        knex.schema.createTableIfNotExists('Person', function(table) {
            table.json('address');
            table.integer('age');
            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        }),
        knex.schema.createTableIfNotExists('Person_Movie', function(table) {
            table.string('movieId');
            table.string('personId');
        }),
    ])
};

exports.down = function (knex, Promise) {

    return Promise.all([
        knex.schema.dropTable('Movie'),
        knex.schema.dropTable('Person'),
        knex.schema.dropTable('Person_Movie'),
    ])
};
