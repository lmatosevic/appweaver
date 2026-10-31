{
  "$schema": "./appweaver.schema.json",
  "config": {
    "app": {
      "name": "{{NAME}}",
      "description": "{{DESCRIPTION}}"
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
