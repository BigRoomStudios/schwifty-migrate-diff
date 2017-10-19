# schwifty-migration
An [Objection.js](https://github.com/Vincit/objection.js) model migration tool for use during development

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

- Goto where `schwifty` gets registered on your server (Most likely in server/manifest.js), and add the `makeMigrationMode` plugin option.
Set it to something like `makeMigrationMode: process.env.MIGRATION_MAKE`

- Run your server start script so that schwifty's `makeMigrationMode` plugin option is set to either 'create' or 'alter'.

Ex.
```
MIGRATION_MAKE=alter npm start
```
- If all goes well, the process will exit and the generated migration file location will be printed to the console. It'll look something like this:
```
//////////////////////////
/////// Success! /////////
Generated new migration file:

/Users/$(whoami)/Developer/my-project/lib/migrations/20170817143549_schwifty-migration.js
```
- Pro-tip: Triple click the line with the filepath, copy, then run `atom ` + paste in terminal to edit the file in Atom.
