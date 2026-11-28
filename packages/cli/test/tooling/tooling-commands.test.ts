import { Command } from 'commander';
import { configOverrides } from '@appweaver/common';
import { runScript, runTool } from '../../tooling/run-tool';
import {
  formatCommand,
  lintCommand,
  runTestsAction
} from '../../tooling/tooling-commands';

jest.mock('../../tooling/run-tool', () => ({
  runTool: jest.fn(async () => 0),
  runScript: jest.fn(async () => 0)
}));

const mockRunTool = runTool as jest.MockedFunction<typeof runTool>;
const mockRunScript = runScript as jest.MockedFunction<typeof runScript>;

describe('tooling-commands', () => {
  const parse = async (
    register: (program: Command) => void,
    args: string[]
  ) => {
    const program = new Command('weaver').exitOverride();
    register(program);
    await program.parseAsync(args, { from: 'user' });
  };

  const registerTest = (program: Command) =>
    runTestsAction(program.command('test'));

  afterEach(() => {
    jest.clearAllMocks();
    delete configOverrides['APP_RUNTIME'];
    process.exitCode = undefined;
  });

  describe('lintCommand', () => {
    test('lints the project by default', async () => {
      await parse(lintCommand, ['lint']);

      expect(mockRunTool).toHaveBeenCalledWith('eslint', ['.'], 'lint');
    });

    test('passes the patterns and the fix flag', async () => {
      await parse(lintCommand, ['lint', 'src/**/*.ts', '--fix']);

      expect(mockRunTool).toHaveBeenCalledWith(
        'eslint',
        ['--fix', 'src/**/*.ts'],
        'lint'
      );
    });

    test('exits with the code of ESLint', async () => {
      mockRunTool.mockResolvedValueOnce(1);

      await parse(lintCommand, ['lint']);

      expect(process.exitCode).toBe(1);
    });
  });

  describe('formatCommand', () => {
    test('writes the TypeScript files by default', async () => {
      await parse(formatCommand, ['format']);

      expect(mockRunTool).toHaveBeenCalledWith(
        'prettier',
        ['--write', './**/*.ts'],
        'format'
      );
    });

    test('checks the given patterns', async () => {
      await parse(formatCommand, ['format', 'src', '--check']);

      expect(mockRunTool).toHaveBeenCalledWith(
        'prettier',
        ['--check', 'src'],
        'format'
      );
    });
  });

  describe('runTestsAction', () => {
    test('runs the unit tests with Jest on Node', async () => {
      configOverrides['APP_RUNTIME'] = 'node';

      await parse(registerTest, ['test', '--coverage', 'a.test.ts']);

      expect(mockRunTool).toHaveBeenCalledWith(
        'jest',
        ['--coverage', 'a.test.ts'],
        'test',
        {}
      );
    });

    test('runs the end-to-end tests with their config and report', async () => {
      configOverrides['APP_RUNTIME'] = 'node';

      await parse(registerTest, ['test', '--e2e', '-w']);

      expect(mockRunTool).toHaveBeenCalledWith(
        'jest',
        ['--config', './test/e2e/jest.e2e-config.json', '--watch'],
        'test',
        { JEST_JUNIT_OUTPUT_NAME: 'e2e.xml' }
      );
    });

    test('runs the unit tests with bun test on Bun', async () => {
      configOverrides['APP_RUNTIME'] = 'bun';

      await parse(registerTest, ['test', '--coverage', '--watch']);

      expect(mockRunScript).toHaveBeenCalledWith('bun', [
        'test',
        './test/unit',
        '--coverage',
        '--watch',
        '--reporter=junit',
        '--reporter-outfile=./reports/junit.xml'
      ]);
      expect(mockRunTool).not.toHaveBeenCalled();
    });

    test('runs the end-to-end tests or the patterns with bun test', async () => {
      configOverrides['APP_RUNTIME'] = 'bun';

      await parse(registerTest, ['test', '--e2e']);
      await parse(registerTest, ['test', 'test/unit/a.test.ts']);

      expect(mockRunScript.mock.calls[0][1]).toEqual([
        'test',
        './test/e2e',
        '--reporter=junit',
        '--reporter-outfile=./reports/e2e.xml'
      ]);
      expect(mockRunScript.mock.calls[1][1]?.[1]).toBe('test/unit/a.test.ts');
    });
  });
});
