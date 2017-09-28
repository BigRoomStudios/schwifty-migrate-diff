'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.json('address');
        table.integer('age');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.dropColumn('address');
        table.dropColumn('age');
    })

};
