#!/bin/sh

# Runs once, when the docker-compose MariaDB container initializes its data volume.
# Prisma Migrate creates a shadow database on every `weaver migration new` so the
# application user may create, migrate, and drop any database, not only its own.

mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" --execute="GRANT ALL PRIVILEGES ON *.* TO '$MARIADB_USER'@'%';"
