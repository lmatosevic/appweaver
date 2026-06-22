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
    "@appweaver/cli": "{{VERSION}}",
    "@appweaver/common": "{{VERSION}}",
    "@appweaver/core": "{{VERSION}}",
{{DEPENDENCIES}}
  },
  "devDependencies": {
    "@eslint/js": "9.39.2",
    "@swc/core": "1.15.41",
    "@swc/jest": "0.2.39",
    "@types/jest": "30.0.0",
    "@types/node": "26.0.0",
    "@typescript-eslint/eslint-plugin": "8.61.1",
    "@typescript-eslint/parser": "8.61.1",
    "eslint": "9.39.2",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-jest": "29.15.2",
    "eslint-plugin-prettier": "5.5.6",
    "globals": "17.6.0",
    "jest": "30.4.2",
    "jest-junit": "17.0.0",
    "prettier": "3.8.4",
    "typescript": "5.9.3",
    "typescript-eslint": "8.61.1"
  }
}
