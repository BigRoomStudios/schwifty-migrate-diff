'use strict';

exports.up = function (knex, Promise) {

    return knex.schema
    .createTableIfNotExists('Zombie', function(table) {
        table.json('address');
        table.integer('age');
        table.string('favoriteFood');
        table.string('firstName');
        table.integer('id');
        table.string('lastName');
    })

};

exports.down = function (knex, Promise) {

    return knex.schema
    .dropTable('Zombie')

};
