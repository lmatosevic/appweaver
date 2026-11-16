#!/bin/sh

# Runs once, when the docker-compose PostgreSQL container initializes its data volume.
# The migrations run as the owner of the database ($POSTGRES_USER, database.migrationUrl), which
# creates the tables, the extensions, the hypertables and the geometry triggers. The application
# queries the data as $DB_USER (database.url), which may only read and write the rows of the
# tables the owner creates. The end-to-end tests run as the owner, in a database of their own.
#
# The default privileges are granted for every schema the owner creates, not IN SCHEMA public:
# `prisma migrate reset` (weaver migration reset) drops and recreates the public schema, which
# would drop the grants on it and its default privileges, locking the application user out.
# The UPDATE of the sequences lets the application user set their values (setval).

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASSWORD';
  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO "$DB_USER";
  GRANT USAGE ON SCHEMA public TO "$DB_USER";
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER"
    GRANT USAGE ON SCHEMAS TO "$DB_USER";
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER"
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$DB_USER";
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER"
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "$DB_USER";
EOSQL
