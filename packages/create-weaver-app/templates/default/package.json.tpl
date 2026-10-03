{
  "name": "{{LOWER_NAME}}",
  "version": "1.0.0",
  "description": "{{DESCRIPTION}}",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "weaver build",
    "start": "weaver start",
    "dev": "weaver start --watch",
    "generate": "weaver generate",
    "migrate": "weaver migrate",
    "seed": "weaver seed --build-project",
    "test": "jest --forceExit --detectOpenHandles --coverage",
    "e2e": "jest --forceExit --detectOpenHandles --config ./test/e2e/jest.e2e-config.json",
    "format": "prettier --write \"./**/*.ts\"",
    "lint": "eslint \"./**/*.ts\""
  },
  "dependencies": {
    "@appweaver/cli": "{{VERSION}}",
    "@appweaver/common": "{{VERSION}}",
    "@appweaver/core": "{{VERSION}}",
{{DEPENDENCIES}}
  },
  "devDependencies": {
{{DEV_DEPENDENCIES}}
  },
  "allowScripts": {
    "@prisma/engines": true,
    "@swc/core": true,
    "better-sqlite3": true,
    "msgpackr-extract": true,
    "prisma": true,
    "unrs-resolver": true
  }
}
