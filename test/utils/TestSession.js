'use strict';

const _ = require('lodash');
const Path = require('path');
const { Promise } = require('objection');
const Knex = require('knex');
const Hoek = require('hoek');

const Joi = require('joi');
const KnexUtils = require('./knexUtils');

class TestSession {

    static init() {

        if (this.staticInitCalled) {
            return;
        }

        registerUnhandledRejectionHandler();

        this.staticInitCalled = true;
    }

    static get optionsSchema() {

        return Joi.object({
            knexConfig: Joi.object({
                client: Joi.string().required(),
                connection: Joi.object().required(),
                migrations: Joi.string()
            }).unknown().required()
        });
    }

    static cloneSession(session, next) {

        const options = Hoek.shallow(session.options);
        return new TestSession({ options, next });
    }

    constructor({ options, next }) {

        Joi.assert(options, TestSession.optionsSchema);

        TestSession.init();

        this.options = options;
        this.client = options.knexConfig.client;
        this.knex = this.createKnex(options);

        // Check db connectivity

        this.initDb()
        .then(() => {

            next();
        });
    }

    createKnex(options) {

        return Knex(options.knexConfig);
    }

    initDb(cb) {

        if (!cb) {
            cb = () => {};
        }

        const knex = this.knex;
        const options = this.options;

        return Promise.all([
            knex.schema.dropTableIfExists('Dog'),
            knex.schema.dropTableIfExists('Movie'),
            knex.schema.dropTableIfExists('Person_Movie'),
            knex.schema.dropTableIfExists('Person'),
            knex.schema.dropTableIfExists('Zombie')
        ])
        .asCallback((err) => {

            if (err) {

                throw new Error('Could not connect to '
                + options.knexConfig.client
                + '. Make sure the server is running and the database '
                + options.knexConfig.connection.database
                + ' is created. You can see the test database configurations from file '
                + Path.join(__dirname, '../knexfile.js')
                + 'Err msg: ' + err.message);

                return cb(err);
            };

            return cb();
        });
    }

    destroy() {

        return this.knex.destroy();
    }

    addUnhandledRejectionHandler(handler) {

        const handlers = TestSession.unhandledRejectionHandlers;
        handlers.push(handler);
    }

    removeUnhandledRejectionHandler(handler) {

        const handlers = TestSession.unhandledRejectionHandlers;
        handlers.splice(handlers.indexOf(handler), 1);
    }

    isPostgres() {

        return KnexUtils.isPostgres(this.knex);
    }

    isMySql() {

        return KnexUtils.isMySql(this.knex);
    }
}

TestSession.staticInitCalled = false;
TestSession.unhandledRejectionHandlers = [];

function registerUnhandledRejectionHandler() { // eslint-disable-line

    Promise.onPossiblyUnhandledRejection((err) => {

        if (_.isEmpty(TestSession.unhandledRejectionHandlers)) {
            console.error(err.stack);
        }

        TestSession.unhandledRejectionHandlers.forEach((handler) => {

            handler(err);
        });
    });
}

module.exports = TestSession;
