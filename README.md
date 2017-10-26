# schwifty-migration

#### An [Objection.js](https://github.com/Vincit/objection.js) model migration tool for use during development

[![Build Status](https://travis-ci.org/BigRoomStudios/schwifty-migration.svg?branch=master)](https://travis-ci.org/BigRoomStudios/schwifty-migration) [![Coverage Status](https://coveralls.io/repos/github/BigRoomStudios/schwifty-migration/badge.svg?branch=master)](https://coveralls.io/github/BigRoomStudios/schwifty-migration?branch=master) [![Security Status](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553/badge)](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553)

## Getting Started
- Run `npm install`
- Install the right version of 'schwifty'
```
npm install git+https://github.com/BigRoomStudios/schwifty.git#add-schwifty-migration
```
- Install 'schwifty-migration'
```
npm install git+https://github.com/BigRoomStudios/schwifty-migration.git
```
---

- Create an npm 'migrate' script so that schwifty's `migrationsMode` plugin option is set to either 'create' or 'alter'.

Ex.
```
// package.json
"scripts": {
    "migrate": "MIGRATE=alter npm start"
}
```


- Now Go to where `schwifty` gets registered on your server (server/manifest.js for example), and add the `migrationsMode` plugin option.

Ex.
```diff
$base: {
    migrateOnStart: true,
+    migrationsMode: process.env.MIGRATE,
    knex: {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
            filename: ':memory:'
        }
    }
}
```

- If all goes well, the process will stop and the generated migration file location will be printed to the console. It'll look like this:
```
//////////////////////////
/////// Success! /////////
Generated new migration file:

/Users/$(whoami)/path/to/migrations/20170817143549_schwifty-migration.js
```
- Pro-tip: Triple click the line with the filepath, copy, then run `atom ` + paste in terminal to edit the file in Atom.
