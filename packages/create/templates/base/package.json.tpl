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
    "e2e": "weaver test --e2e",
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
  "allowScripts": {
    "@parcel/watcher": false,
    "@prisma/engines": true,
    "@swc/core": true,
    "esbuild": false,
    "msgpackr-extract": true,
    "prisma": true,
    "unrs-resolver": true
  }
}
