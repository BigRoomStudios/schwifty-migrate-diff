'use strict';

exports.up = function (knex, Promise) {

    return Promise.all([
        knex.schema.createTableIfNotExists('Movie1', function(table) {
            table.integer('id');
            table.string('subTitle');
            table.string('title');
        }),
        knex.schema.createTableIfNotExists('Person1', function(table) {
            table.json('address');
            table.integer('age');
            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        }),
        knex.schema.createTableIfNotExists('Person_Movie1', function(table) {
            table.string('four-extra');
            table.string('movieId');
            table.string('one-extra');
            table.string('personId');
            table.string('three-extra');
            table.string('two-extra');
        }),
    ])
};

exports.down = function (knex, Promise) {

    return Promise.all([
        knex.schema.dropTable('Movie1'),
        knex.schema.dropTable('Person1'),
        knex.schema.dropTable('Person_Movie1'),
    ])
};
