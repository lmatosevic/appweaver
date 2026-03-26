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
    "seed": "weaver seed --buildProject",
    "test": "jest --forceExit --detectOpenHandles --coverage",
    "e2e": "jest --forceExit --detectOpenHandles --config ./test/e2e/jest.e2e-config.json",
    "format": "prettier --write \"./**/*.ts\"",
    "lint": "eslint \"./**/*.ts\""
  },
  "dependencies": {
    "@appweaver/common": "{{VERSION}}",
    "@appweaver/core": "{{VERSION}}",
    "@prisma/client": "7.5.0",
{{DEPENDENCIES}},
    "prisma": "7.5.0"
  },
  "devDependencies": {
    "@appweaver/cli": "{{VERSION}}",
    "@eslint/js": "9.39.2",
    "@swc/core": "1.15.10",
    "@swc/jest": "0.2.39",
    "@types/jest": "30.0.0",
    "@types/node": "25.0.10",
    "@typescript-eslint/eslint-plugin": "8.53.1",
    "@typescript-eslint/parser": "8.53.1",
    "eslint": "9.39.2",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-jest": "29.12.1",
    "eslint-plugin-prettier": "5.5.5",
    "globals": "17.0.0",
    "jest": "30.2.0",
    "jest-junit": "16.0.0",
    "prettier": "3.8.1",
    "typescript": "5.9.3",
    "typescript-eslint": "8.53.1"
  }
}
