// The commands only call into these from their actions, which never run here
jest.mock('@appweaver/core', () => ({
  createApp: jest.fn(),
  createSeeder: jest.fn()
}));
// fkill and prettier are ESM only
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('prettier', () => ({
  __esModule: true,
  default: { format: jest.fn(), resolveConfig: jest.fn() }
}));

import { Command } from 'commander';
import { cliConventionViolations } from '@appweaver/testing';
import { buildCommand } from '../build';
import { configCommand } from '../config';
import { generateCommand } from '../generate';
import { migrateCommand } from '../migrate';
import { migrationCommand } from '../migration';
import { moduleCommand } from '../module';
import { openapiCommand } from '../openapi';
import { runCommand } from '../run';
import { seedCommand } from '../seed';
import { startCommand } from '../start';
import { testingCommand } from '../testing';
import { upgradeCommand } from '../upgrade';

/** Registers every command the way `weaver.ts` does. */
function createProgram(): Command {
  const program = new Command('weaver');
  for (const register of [
    buildCommand,
    configCommand,
    generateCommand,
    migrateCommand,
    migrationCommand,
    moduleCommand,
    openapiCommand,
    runCommand,
    seedCommand,
    startCommand,
    testingCommand,
    upgradeCommand
  ]) {
    register(program);
  }
  return program;
}

function findOption(path: string[], flag: string) {
  let command: Command | undefined = createProgram();
  for (const name of path) {
    command = command?.commands.find((c) => c.name() === name);
  }
  return command?.options.find((option) => option.long === flag);
}

describe('weaver', () => {
  test('follows the CLI conventions in every command', () => {
    const program = createProgram().description('Appweaver CLI.');

    expect(cliConventionViolations(program)).toEqual([]);
  });

  test.each([
    [['generate'], '--no-registry', 'registry'],
    [['generate'], '--no-config-schema', 'configSchema'],
    [['upgrade'], '--no-skill', 'skill'],
    [['upgrade'], '--no-companions', 'companions'],
    [['module', 'add'], '--no-install', 'install'],
    [['module', 'remove'], '--no-install', 'install']
  ])(
    'declares %s %s as a negation of the %s option',
    (path, flag, attribute) => {
      const option = findOption(path, flag);

      expect(option?.negate).toBe(true);
      expect(option?.attributeName()).toBe(attribute);
    }
  );

  test.each([
    [['seed'], '--build-project', 'buildProject'],
    [['seed'], '--continue-on-error', 'continueOnError'],
    [['seed'], '--fix-warnings', 'fixWarnings'],
    [['upgrade'], '--dry-run', 'dryRun'],
    [['upgrade'], '--target-version', 'targetVersion'],
    [['module', 'add'], '--dry-run', 'dryRun'],
    [['module', 'remove'], '--dry-run', 'dryRun'],
    [['seed'], '--seeders-dir', 'seedersDir'],
    [['test', 'setup'], '--temp-dir', 'tempDir'],
    [['test', 'setup'], '--prisma-schema-path', 'prismaSchemaPath'],
    [['test', 'setup'], '--client-dir', 'clientDir'],
    [['test', 'setup'], '--migration-name', 'migrationName'],
    [['test', 'reset'], '--temp-dir', 'tempDir'],
    [['test', 'teardown'], '--temp-dir', 'tempDir'],
    [['generate'], '--prisma-schema', 'prismaSchema'],
    [['generate'], '--prisma-schema-path', 'prismaSchemaPath'],
    [['generate'], '--client-dir', 'clientDir'],
    [['generate'], '--config-schema', 'configSchema'],
    [['openapi'], '--output-path', 'outputPath']
  ])('reads %s %s as the %s option', (path, flag, attribute) => {
    expect(findOption(path, flag)?.attributeName()).toBe(attribute);
  });

  test.each([
    [[], { skill: true, companions: true }],
    [
      ['--no-skill', '--no-companions', '--dry-run'],
      { skill: false, companions: false, dryRun: true }
    ]
  ])('parses upgrade %j into %j', async (args, expected) => {
    const program = createProgram();
    const action = jest.fn();
    program.commands.find((c) => c.name() === 'upgrade')!.action(action);

    await program.parseAsync(['upgrade', ...args], { from: 'user' });

    expect(action.mock.calls[0][1]).toMatchObject(expected);
  });
});
