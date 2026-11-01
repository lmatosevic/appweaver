import { Command } from 'commander';
import { cliConventionViolations } from '@appweaver/testing';

describe('cliConventionViolations', () => {
  const program = () =>
    new Command('tool')
      .description('A tool.')
      .version('1.0.0', '-v, --version', 'Output the version.');

  test('should accept a program following the conventions', () => {
    const tool = program();
    tool
      .command('build')
      .description('Build the project.')
      .argument('<source-dir>', 'Source directory.')
      .option('-p, --project <path>', 'Project file.', 'tsconfig.json')
      .option(
        '-o, --output-dir <dir>',
        'Output directory. (default: from config)'
      )
      .option('--no-install', 'Skip the installation.')
      .option('--dry-run', 'Print the changes.')
      .option('-y, --yes', 'Skip the prompt.')
      .option('-f, --force', 'Overwrite the files.')
      .option('--verbose', 'Print verbose output.');

    expect(cliConventionViolations(tool)).toEqual([]);
  });

  test('should report every violation of a command', () => {
    const tool = program();
    tool
      .command('build')
      .description('Build the project')
      .argument('<sourceDir>', 'Source directory')
      .option('-c, --config <path>', 'Config file.')
      .option('--outputPath <path>', 'Output path.')
      .option('--types-path [path]', 'Types path.')
      .option('--client-dir <clientDir>', 'Client directory')
      .option('--verbose', 'Print verbose output.')
      .option('-f, --force', 'Overwrite the files.')
      .option('--format <format>', 'Format.');

    expect(cliConventionViolations(tool)).toEqual([
      'tool build: the description ends without a period',
      'tool build <sourceDir>: the name is not kebab-case',
      'tool build <sourceDir>: the description ends without a period',
      'tool build --config: -c is reserved for another flag',
      'tool build --outputPath: the flag is not kebab-case',
      'tool build --types-path: the value is optional, declare it as <value>',
      'tool build --client-dir: the placeholder <clientDir> is not kebab-case',
      'tool build --client-dir: the description ends without a period',
      'tool build: --force, --verbose must close the options in this order'
    ]);
  });

  test('should report the trailing flags in the wrong order', () => {
    const tool = program();
    tool
      .command('add')
      .description('Add a module.')
      .option('--verbose', 'Print verbose output.')
      .option('--dry-run', 'Print the changes.');

    expect(cliConventionViolations(tool)).toEqual([
      'tool add: --dry-run, --verbose must close the options in this order'
    ]);
  });

  test('should accept a variadic placeholder', () => {
    const tool = program();
    tool
      .command('add')
      .description('Add modules.')
      .argument('<modules...>', 'Modules to add.')
      .option('--exclude <modules...>', 'Modules to leave out.');

    expect(cliConventionViolations(tool)).toEqual([]);
  });
});
