{
  "$schema": "./node_modules/@appweaver/common/config/schema.json",
  "config": {
    "app": {
      "name": "{{NAME}}",
      "description": "{{DESCRIPTION}}",
      "runtime": "bun"
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
      },
      "template": {
        "cache": false
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
      },
      "redis": {
        "provider": "@appweaver/core/memory/in-memory"
      },
      "queue": {
        "provider": "@appweaver/core/queue/memory-queue"
      },
      "mailer": {
        "provider": "@appweaver/core/mailer/json-mailer"
      },
      "scheduler": {
        "autoStartJob": false
      }
    }
  }
}
