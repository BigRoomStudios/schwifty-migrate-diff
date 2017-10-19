'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
        .createTableIfNotExists('Person', function(table) {
            table.string('firstName');
            table.integer('id');
            table.string('lastName');
        })

};

exports.down = function (knex, Promise) {

    return knex.schema
        .dropTable('Person')

};
