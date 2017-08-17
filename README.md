# schwifty-migration

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

- Goto where `schwifty` gets registered on your server (Most likely in server/config.js), and add the `makeMigrationMode` plugin option.
Set it to something like `makeMigrationMode: process.env.MIGRATE === 'true'`

- Run your server start script so that schwifty's `makeMigrationMode` plugin option is set to true.

Ex.
```
MIGRATION=true npm start
```
- If all goes well, the process will exit and the generated migration file location will be printed to the console. It'll look something like this:
```
//////////////////////////
/////// Success! /////////
Generated new migration file:

/Users/$(whoami)/Developer/my-project/lib/migrations/20170817143549_schwifty-migration.js
```
- Pro-tip: Triple click the line with the filepath, copy, then run `atom ` + paste in terminal to edit the file in Atom.
