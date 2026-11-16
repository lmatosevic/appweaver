#!/bin/sh

# Runs once, when the docker-compose MariaDB container initializes its data volume.
# Prisma Migrate creates a shadow database with a random name on every `weaver migration new`,
# so the user the migrations run as (database.migrationUrl, or database.url when not set) may
# create, migrate, and drop any database, not only its own.

mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" --execute="GRANT ALL PRIVILEGES ON *.* TO '$MARIADB_USER'@'%';"
