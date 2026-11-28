import { Command } from 'commander';
import { appConfig, Runtime } from '@appweaver/common';
import { runScript, runTool } from './run-tool';

/**
 * Registers the `lint` command, running the ESLint of `@appweaver/tooling` with the `eslint.config.mjs` of the project.
 *
 * @param {Command} program - The program to register the command on.
 */
export function lintCommand(program: Command): void {
  program
    .command('lint')
    .description('Lint the project with the ESLint of @appweaver/tooling.')
    .argument('[patterns...]', 'Files or glob patterns to lint. (default: .)')
    .option('--fix', 'Fix the problems that can be fixed automatically.')
    .action(async (patterns: string[], _, command: Command) => {
      const args = [
        ...(command.getOptionValue('fix') ? ['--fix'] : []),
        ...(patterns.length > 0 ? patterns : ['.'])
      ];
      process.exitCode = await runTool('eslint', args, 'lint');
    });
}

/**
 * Registers the `format` command, running the Prettier of `@appweaver/tooling`.
 *
 * @param {Command} program - The program to register the command on.
 */
export function formatCommand(program: Command): void {
  program
    .command('format')
    .description('Format the project with the Prettier of @appweaver/tooling.')
    .argument(
      '[patterns...]',
      'Files or glob patterns to format. (default: ./**/*.ts)'
    )
    .option(
      '--check',
      'Check that the files are formatted without writing them.'
    )
    .action(async (patterns: string[], _, command: Command) => {
      const args = [
        command.getOptionValue('check') ? '--check' : '--write',
        ...(patterns.length > 0 ? patterns : ['./**/*.ts'])
      ];
      process.exitCode = await runTool('prettier', args, 'format');
    });
}

/** The Jest config of the end-to-end tests of a project. */
const E2E_JEST_CONFIG = './test/e2e/jest.e2e-config.json';

/**
 * Adds running the tests to the `test` command, whose subcommands set up the test environment: the Jest of
 * `@appweaver/tooling` on Node, `bun test` on Bun.
 *
 * @param {Command} testCommand - The `test` command.
 */
export function runTestsAction(testCommand: Command): void {
  testCommand
    .argument(
      '[patterns...]',
      'Test files or patterns to run. (default: every unit test)'
    )
    .option('--e2e', 'Run the end-to-end tests of test/e2e.')
    .option('--coverage', 'Collect the coverage of the unit tests.')
    .option('-w, --watch', 'Run the tests again on every change.')
    .action(async (patterns: string[], _, command: Command) => {
      const e2e = !!command.getOptionValue('e2e');
      const coverage = !!command.getOptionValue('coverage');
      const watch = !!command.getOptionValue('watch');

      if (appConfig.RUNTIME === Runtime.Bun) {
        const report = e2e ? 'e2e.xml' : 'junit.xml';
        process.exitCode = await runScript('bun', [
          'test',
          ...(patterns.length > 0
            ? patterns
            : [e2e ? './test/e2e' : './test/unit']),
          ...(coverage ? ['--coverage'] : []),
          ...(watch ? ['--watch'] : []),
          '--reporter=junit',
          `--reporter-outfile=./reports/${report}`
        ]);
        return;
      }

      process.exitCode = await runTool(
        'jest',
        [
          ...(e2e ? ['--config', E2E_JEST_CONFIG] : []),
          ...(coverage ? ['--coverage'] : []),
          ...(watch ? ['--watch'] : []),
          ...patterns
        ],
        'test',
        e2e ? { JEST_JUNIT_OUTPUT_NAME: 'e2e.xml' } : {}
      );
    });
}
