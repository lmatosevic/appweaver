import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginJest from 'eslint-plugin-jest';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

export default tsEslint.config(
  {
    ignores: [
      'node_modules',
      '**/node_modules/**',
      '**/prisma/client',
      '**/database/client',
      '**/*.js',
      '**/*.d.ts'
    ]
  },
  eslint.configs.recommended,
  ...tsEslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  eslintPluginJest.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // One program of the root tsconfig for every package file: the project service would open the build project of
    // each package beside it. The samples are projects of their own, each linted in its own process by tools/lint.js,
    // since the programs of all of them never fit into the memory of one
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.json'
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  },
  {
    // The streams of the realtime module never depend on the transports, the web or the data layers, so they can move
    // to a package without a server
    files: ['packages/realtime/stream/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@appweaver/web',
                '@appweaver/web/*',
                '@appweaver/data',
                '@appweaver/data/*'
              ],
              message:
                'The streams depend on @appweaver/common and @appweaver/core only.'
            },
            {
              group: [
                '../gateway/*',
                '../transport/*',
                '../web/*',
                '../types',
                '../action',
                '../channel',
                '../utils/access',
                '../utils/auth-user'
              ],
              message:
                'The streams never import the gateway, the transports, the web part, the channels or the access checks.'
            }
          ]
        }
      ]
    }
  },
  {
    // The contract suites export the tests other packages run
    files: ['packages/testing/contracts/**/*.ts'],
    rules: {
      'jest/no-export': 'off'
    }
  }
);
