{
  "$schema": "./appweaver.schema.json",
  "config": {
    "app": {
      "name": "{{NAME}}",
      "description": "{{DESCRIPTION}}"
    },
    "server": {
      "host": "{{HOST}}",
      "port": {{PORT}}
    },
    "database": {
      "url": "{{DATABASE_URL}}"
    }
  },
  "environments": {
    "dev": {
      "log": {
        "level": "debug",
        "pretty": true
      }
    },
    "test": {
      "log": {
        "level": "silent",
        "sync": true
      },
      "database": {
        "url": "{{DATABASE_TEST_URL}}",
        "schemaPath": "./temp/database/schema.prisma",
        "migrationsDirPath": "./temp/database/migrations",
        "clientOutputDirPath": "./temp/database/client"
      },
      "storage": {
        "path": "./temp/storage"
      }
    }
  }
}
