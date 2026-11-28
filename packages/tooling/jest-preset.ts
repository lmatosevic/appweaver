import type { Config } from 'jest';

/**
 * The Jest preset of an Appweaver project on Node, `"preset": "@appweaver/tooling"`: SWC compiles the TypeScript, and
 * the results are reported in the JUnit format of `reports/junit.xml` too. The transformer and the reporter are
 * resolved from this package, wherever the package manager placed them.
 */
const preset: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/e2e/'],
  transform: {
    '^.+\\.(t|j)s$': [
      require.resolve('@swc/jest'),
      {
        jsc: {
          parser: { syntax: 'typescript', dynamicImport: true },
          target: 'es2024'
        },
        module: { type: 'commonjs' },
        sourceMaps: 'inline'
      }
    ]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(content-disposition|cookie|@fastify/cookie)/)'
  ],
  reporters: [
    'default',
    [
      require.resolve('jest-junit'),
      { outputDirectory: './reports', outputName: 'junit.xml' }
    ]
  ],
  coverageReporters: ['cobertura', 'text'],
  coverageDirectory: './reports'
};

export = preset;
