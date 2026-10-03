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
    "seed": "weaver seed",
    "test": "bun test ./test/unit --coverage --reporter=junit --reporter-outfile=./reports/junit.xml",
    "e2e": "bun test ./test/e2e --reporter=junit --reporter-outfile=./reports/e2e.xml --preload ./test/e2e/support/preload.ts",
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
  "trustedDependencies": [
    "@prisma/engines",
    "msgpackr-extract",
    "prisma",
    "unrs-resolver"
  ]
}
