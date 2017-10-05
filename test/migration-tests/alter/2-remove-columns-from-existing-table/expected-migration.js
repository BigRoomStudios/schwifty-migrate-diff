'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.dropColumn('age')
        table.dropColumn('lastName')
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.integer('age');
        table.string('lastName');
    })

};
