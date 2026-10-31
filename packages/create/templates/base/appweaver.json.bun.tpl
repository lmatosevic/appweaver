{
  "$schema": "./appweaver.schema.json",
  "config": {
    "app": {
      "name": "{{NAME}}",
      "description": "{{DESCRIPTION}}",
      "runtime": "bun"
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
      }
    }
  }
}
