# schwifty-migrate-diff

An [Objection.js](https://github.com/Vincit/objection.js) model diff tool for generating knex migrations

[![Build Status](https://travis-ci.org/BigRoomStudios/schwifty-migrate-diff.svg?branch=master)](https://travis-ci.org/BigRoomStudios/schwifty-migrate-diff) [![Coverage Status](https://coveralls.io/repos/github/BigRoomStudios/schwifty-migrate-diff/badge.svg?branch=master)](https://coveralls.io/github/BigRoomStudios/schwifty-migrate-diff?branch=master) [![Security Status](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553/badge)](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553)

Lead Maintainer - [William Woodruff](https://github.com/wswoodruff)

## Usage

This package is used primarily by [schwifty](https://github.com/hapipal/schwifty) to implement the [`hpal run schwifty:migrate:diff`](https://github.com/hapipal/schwifty/blob/master/API.md#schwiftymigratediff) command.  Before being able to use the `schwifty:migrate:diff` command, this package must be installed in your project.

```sh
npm install --save-dev schwifty-migrate-diff
```

Note that schwifty-migrate-diff only _generates_ a knex migration file, and does not run the migration.  It's highly suggested to review the generated migration file.  Bear in mind that schwifty will run migrations during server initialization when it's registered with `migrateOnStart` set to `true`.
