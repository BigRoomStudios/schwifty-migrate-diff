'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .createTableIfNotExists('Movie', function(table) {
        table.integer('id');
        table.string('title');
        table.string('subTitle');
    })
    .createTableIfNotExists('Person', function(table) {
        table.integer('id');
        table.string('firstName');
        table.string('lastName');
        table.integer('age');
        table.json('address');
    })
    .createTableIfNotExists('Person_Movie', function(table) {
        table.string('one-extra');
        table.string('two-extra');
        table.string('personId');
        table.string('movieId');
        table.string('three-extra');
        table.string('four-extra');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .dropTable('Movie')
    .dropTable('Person')
    .dropTable('Person_Movie')

};
