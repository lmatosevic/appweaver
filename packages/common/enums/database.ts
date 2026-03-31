export enum DatabaseType {
  Sqlite = 'sqlite',
  PostgresSQL = 'postgresql',
  MySQL = 'mysql',
  SQLServer = 'sqlserver'
}

export enum DatabaseEvent {
  Query = 'query',
  Info = 'info',
  Warn = 'warn',
  Error = 'error'
}
