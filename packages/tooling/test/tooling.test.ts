import fs from 'node:fs';
import { toolBin } from '../index';
import { eslintConfig } from '../eslint';
import prettierConfig from '../prettier';
import jestPreset from '../jest-preset';

describe('tooling', () => {
  describe('toolBin', () => {
    test.each(['eslint', 'prettier', 'jest'] as const)(
      'resolves the executable of %s',
      (tool) => {
        expect(fs.existsSync(toolBin(tool))).toBe(true);
      }
    );
  });

  describe('eslintConfig', () => {
    type Configs = ReturnType<typeof eslintConfig>;
    const hasJestPlugin = (configs: Configs) =>
      configs.some((config) => config.plugins?.jest !== undefined);
    const languageOption = (configs: Configs, key: string) =>
      configs.map(
        (config) =>
          (config.languageOptions as Record<string, any> | undefined)?.[key]
      );

    test('lints the TypeScript of the project with the Jest rules on Node', () => {
      const configs = eslintConfig({ rootDir: '/project' });

      expect(configs[0].ignores).toEqual(
        expect.arrayContaining(['node_modules', 'dist', 'database/client'])
      );
      expect(hasJestPlugin(configs)).toBe(true);
      expect(
        languageOption(configs, 'parserOptions').some(
          (options) => options?.tsconfigRootDir === '/project'
        )
      ).toBe(true);
    });

    test('uses the globals of bun test on Bun, without the Jest rules', () => {
      const configs = eslintConfig({
        rootDir: '/project',
        runtime: 'bun',
        ignores: ['generated']
      });

      expect(configs[0].ignores).toContain('generated');
      expect(hasJestPlugin(configs)).toBe(false);
      expect(
        languageOption(configs, 'globals').some((globals) => globals?.jest)
      ).toBe(false);
    });
  });

  describe('prettier', () => {
    test('formats with single quotes and no trailing commas', () => {
      expect(prettierConfig).toMatchObject({
        singleQuote: true,
        trailingComma: 'none',
        printWidth: 80
      });
    });
  });

  describe('jest-preset', () => {
    test('compiles with SWC and reports with jest-junit, resolved from the package', () => {
      const [transformer] = Object.values(
        jestPreset.transform ?? {}
      )[0] as unknown as [string];
      const [, [reporter]] = jestPreset.reporters as unknown as [
        string,
        [string]
      ];

      expect(fs.existsSync(transformer)).toBe(true);
      expect(fs.existsSync(reporter)).toBe(true);
      expect(jestPreset.testPathIgnorePatterns).toContain('/test/e2e/');
    });
  });
});
