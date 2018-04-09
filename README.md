# schwifty-migration

#### An [Objection.js](https://vincit.github.io/objection.js) model migration tool for use during development

[![Build Status](https://travis-ci.org/BigRoomStudios/schwifty-migration.svg?branch=master)](https://travis-ci.org/BigRoomStudios/schwifty-migration) [![Coverage Status](https://coveralls.io/repos/github/BigRoomStudios/schwifty-migration/badge.svg?branch=master)](https://coveralls.io/github/BigRoomStudios/schwifty-migration?branch=master) [![Security Status](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553/badge)](https://nodesecurity.io/orgs/big-room-studios/projects/3f03e446-4689-49b3-9d82-ab3070eea553)

## Usage with [`schwifty`](https://github.com/BigRoomStudios/schwifty) by means of [`hpal`](https://github.com/devinivy/hpal)

Schwifty registers an hpal command called `migrate` that will detect where your project's closest migrations folder is, and generate a migration file in that folder using `schwifty-migration`.

The command receives 3 options separated by spaces like normal bash commands. The signature:

```
npx hpal run schwifty:migrate [migrationMode] [fileName] [migrationsDir]
```

Where:
  - `[migrationMode]` can be either `create` or `alter`, defaults to create
  - `[fileName]` will affect the name of the generated migration file -- useful for describing what changes were made in a migration, like a mini commit message. Defaults to schwifty_migration
  - `[migrationsDir]` specifies a migrationsDir. Defaults to the closest one we're able to find in the project's root, errors if none can be found

NOTE: **_schwifty-migration will only generate a migration file, it does not run migrations with Knex_** (applying these changes to your tables) -- that will happen depending on your settings with schwifty -- `options.migrateOnStart`
