import eslint from '@eslint/js';
import eslintPluginJest from 'eslint-plugin-jest';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tsEslint from 'typescript-eslint';
import type { Linter } from 'eslint';

/** The options of `eslintConfig`. */
export type EslintConfigOptions = {
  /** The root directory of the project, holding its `tsconfig.json` (`import.meta.dirname` of `eslint.config.mjs`) */
  rootDir: string;
  /** The runtime the tests run on: the Jest rules and globals on `node`, the globals of `bun test` on `bun` */
  runtime?: 'node' | 'bun';
  /** More paths to ignore, besides the dependencies, the build output, the Prisma client and the JavaScript files */
  ignores?: string[];
};

/** The rules of typescript-eslint an Appweaver project turns off: the framework types its schemas loosely. */
const relaxedRules: Linter.RulesRecord = {
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
};

/**
 * Creates the ESLint flat config of an Appweaver project: the recommended rules of ESLint and of the type checked
 * typescript-eslint, Prettier, and Jest on Node. In `eslint.config.mjs`:
 *
 * ```js
 * import { eslintConfig } from '@appweaver/tooling/eslint';
 *
 * export default eslintConfig({ rootDir: import.meta.dirname });
 * ```
 *
 * @param {EslintConfigOptions} options - The root directory of the project, its runtime and more ignored paths.
 * @return {Linter.Config[]} The flat config.
 */
export function eslintConfig(options: EslintConfigOptions): Linter.Config[] {
  const bun = options.runtime === 'bun';
  return [
    {
      ignores: [
        'node_modules',
        'dist',
        'database/client',
        '**/*.js',
        '**/*.mjs',
        '**/*.cjs',
        '**/*.d.ts',
        ...(options.ignores ?? [])
      ]
    },
    eslint.configs.recommended,
    ...(tsEslint.configs.recommendedTypeChecked as Linter.Config[]),
    eslintPluginPrettierRecommended,
    ...(bun ? [] : [eslintPluginJest.configs['flat/recommended']]),
    {
      languageOptions: {
        globals: {
          ...globals.node,
          ...(bun ? globals.bunBuiltin : globals.jest)
        },
        sourceType: 'module',
        parserOptions: {
          projectService: true,
          tsconfigRootDir: options.rootDir
        }
      }
    },
    { rules: relaxedRules }
  ];
}
