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
    "generate": "weaver generate --config-schema",
    "test": "weaver test --coverage",
    "e2e": "bun test ./test/e2e --reporter=junit --reporter-outfile=./reports/e2e.xml",
    "format": "weaver format",
    "lint": "weaver lint"
  },
  "prettier": "@appweaver/tooling/prettier",
  "dependencies": {
    "@appweaver/cli": "{{VERSION}}",
    "@appweaver/common": "{{VERSION}}",
    "@appweaver/core": "{{VERSION}}",
{{DEPENDENCIES}}
  },
  "devDependencies": {
    "@appweaver/tooling": "{{VERSION}}",
{{DEV_DEPENDENCIES}}
  },
  "trustedDependencies": [
    "@prisma/engines",
    "msgpackr-extract",
    "prisma",
    "unrs-resolver"
  ]
}
