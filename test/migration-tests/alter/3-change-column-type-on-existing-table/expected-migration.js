'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.boolean('firstName').alter();
        table.number('lastName').alter();
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .alterTable('Person', function(table) {
        table.string('firstName').alter();
        table.string('lastName').alter();
    })

};
