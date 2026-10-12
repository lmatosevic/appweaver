export enum DatabaseType {
  Sqlite = 'sqlite',
  PostgreSQL = 'postgresql',
  MySQL = 'mysql',
  SQLServer = 'sqlserver'
}

export enum DatabaseEvent {
  Query = 'query',
  Info = 'info',
  Warn = 'warn',
  Error = 'error'
}
