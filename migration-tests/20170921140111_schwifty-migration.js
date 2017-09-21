'use strict';

exports.up = function (knex, Promise) {

    return Promise.all([
        knex.schema.createTableIfNotExists('Dog', function(table) {
            table.string('favoriteToy');
            table.integer('id');
            table.string('name');
            table.integer('ownerId');
        }),
    ])
};

exports.down = function (knex, Promise) {

    return Promise.all([
        knex.schema.dropTable('Dog'),
    ])
};
