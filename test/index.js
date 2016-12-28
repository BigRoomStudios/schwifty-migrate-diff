'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Path = require('path');
const SchwiftyMigration = require('..');


// Test shortcuts

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

describe('SchwiftyMigration', () => {

    const getServer = (options, cb) => {

        const server = new Hapi.Server();
        server.connection();

        server.register({
            register: Schwifty,
            options
        }, (err) => {

            if (err) {
                return cb(err);
            }

            return cb(null, server);
        });
    };


});



/*it('throws when `migration` options are specified more than once.', (done) => {

    const options = getOptions();
    options.migration = {
        dir: Path.normalize('./'),
        mode: 'create'
    };

    getServer(options, (err, server) => {

        expect(err).to.not.exist();

        const plugin = (srv, opts, next) => {

            srv.register({ options, register: Schwifty }, next);
        };

        plugin.attributes = { name: 'my-plugin' };

        expect(() => {

            server.register(plugin, () => done('Should not make it here.'));
        }).to.throw('Schwifty\'s migration options can only be specified once.');

        done();
    });
});*/
