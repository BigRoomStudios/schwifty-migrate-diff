
// column compiler types : db types

exports.columnCompilerAliasMap = {
    varchar   : ['character varying', 'varchar'],
    boolean   : ['boolean'],
    integer   : ['integer'],
    date      : ['date', 'datetime', 'timestamp with time zone'],
    timestamp : ['timestamp'],
    time      : ['time'],
    json      : ['json'],
    text      : ['text'],
    float     : ['float'],
    bigint    : ['bigint'],
    tinyint   : ['tinyint'],
    decimal   : ['decimal'],
    blob      : ['blob']
}
