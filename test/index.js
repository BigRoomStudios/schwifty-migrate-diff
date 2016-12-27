
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
