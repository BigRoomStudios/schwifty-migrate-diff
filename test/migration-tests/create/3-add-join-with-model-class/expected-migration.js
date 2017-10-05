'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .createTableIfNotExists('Movie', function(table) {
        table.integer('id');
        table.string('subTitle');
        table.string('title');
    })
    .createTableIfNotExists('Person', function(table) {
        table.json('address');
        table.integer('age');
        table.string('firstName');
        table.integer('id');
        table.string('lastName');
    })
    .createTableIfNotExists('Person_Movie', function(table) {
        table.integer('movieId');
        table.integer('personId');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .dropTable('Movie')
    .dropTable('Person')
    .dropTable('Person_Movie')

};
