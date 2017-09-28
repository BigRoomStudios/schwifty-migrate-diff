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
        table.string('four-extra');
        table.string('movieId');
        table.string('one-extra');
        table.string('personId');
        table.string('three-extra');
        table.string('two-extra');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .dropTable('Movie')
    .dropTable('Person')
    .dropTable('Person_Movie')

};
