# schwifty-migrate-diff

#### An [Objection.js](https://vincit.github.io/objection.js) model migration diff tool for use during development

[![Build Status](https://travis-ci.org/BigRoomStudios/schwifty-migrate-diff.svg?branch=master)](https://travis-ci.org/BigRoomStudios/schwifty-migrate-diff) [![Coverage Status](https://coveralls.io/repos/github/BigRoomStudios/schwifty-migrate-diff/badge.svg?branch=master)](https://coveralls.io/github/BigRoomStudios/schwifty-migrate-diff?branch=master) [![Security Status](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553/badge)](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553)

Lead Maintainer - [William Woodruff](https://github.com/wswoodruff)

## Usage
This package is used by [schwifty](https://github.com/hapipal/schwifty) to implement the `hpal run schwifty:migrate:diff` command

Before being able to use the hpal command, run:
```
npm install --save-dev schwifty-migrate-diff
```

---

NOTE: **_schwifty-migrate-diff will only generate a migration file, it does not run migrations with Knex_** (will not apply these changes to your tables) -- that will happen depending on your settings with schwifty -- `options.migrateOnStart`
