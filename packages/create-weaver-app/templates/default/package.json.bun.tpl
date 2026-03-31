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
    "test": "bun test ./test/unit --coverage ./src/**/*.ts --reporter=junit --reporter-outfile=./reports/junit.xml",
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
    "@eslint/js": "9.39.2",
    "@types/bun": "1.3.11",
    "@types/node": "25.0.10",
    "@typescript-eslint/eslint-plugin": "8.53.1",
    "@typescript-eslint/parser": "8.53.1",
    "eslint": "9.39.2",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-prettier": "5.5.5",
    "prettier": "3.8.1",
    "typescript": "5.9.3",
    "typescript-eslint": "8.53.1"
  }
}
