'use strict';

exports.up = (knex, Promise) => {

    return knex.schema
        .createTableIfNotExists('Zombie', (table) => {

            table.integer('id');
            table.string('firstName');
            table.string('lastName');
            table.integer('age');
            table.json('address');
            table.string('favoriteFood');
        });
};

exports.down = (knex, Promise) => {

    return knex.schema
        .dropTable('Zombie');
};
