'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .createTableIfNotExists('Person', function(table) {
        table.json('address');
        table.integer('age');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .dropTable('Person')

};
