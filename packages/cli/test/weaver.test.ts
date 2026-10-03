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
import { buildCommand } from '../build';
import { generateCommand } from '../generate';
import { migrateCommand } from '../migrate';
import { migrationCommand } from '../migration';
import { openapiCommand } from '../openapi';
import { seedCommand } from '../seed';
import { startCommand } from '../start';
import { testingCommand } from '../testing';
import { updateCommand } from '../update';

const KEBAB_CASE_FLAG = /^--[a-z0-9]+(-[a-z0-9]+)*$/;

/** Registers every command the way `weaver.ts` does. */
function createProgram(): Command {
  const program = new Command('weaver');
  for (const register of [
    buildCommand,
    generateCommand,
    migrateCommand,
    migrationCommand,
    openapiCommand,
    seedCommand,
    startCommand,
    testingCommand,
    updateCommand
  ]) {
    register(program);
  }
  return program;
}

/** Collects every command and nested subcommand of the program. */
function allCommands(command: Command): Command[] {
  return command.commands.flatMap((sub) => [sub, ...allCommands(sub)]);
}

function findOption(path: string[], flag: string) {
  let command: Command | undefined = createProgram();
  for (const name of path) {
    command = command?.commands.find((c) => c.name() === name);
  }
  return command?.options.find((option) => option.long === flag);
}

describe('weaver', () => {
  test('uses kebab-case long flags in every command', () => {
    const flags = allCommands(createProgram()).flatMap((command) =>
      command.options.map((option) => `${command.name()} ${option.long}`)
    );

    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(flag.split(' ')[1]).toMatch(KEBAB_CASE_FLAG);
    }
  });

  test.each([
    [['generate'], '--no-registry', 'registry'],
    [['update'], '--no-skill', 'skill'],
    [['update'], '--no-companions', 'companions']
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
    [['update'], '--dry-run', 'dryRun'],
    [['update'], '--target-version', 'targetVersion'],
    [['test', 'setup'], '--migration-name', 'migrationName'],
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
  ])('parses update %j into %j', async (args, expected) => {
    const program = createProgram();
    const action = jest.fn();
    program.commands.find((c) => c.name() === 'update')!.action(action);

    await program.parseAsync(['update', ...args], { from: 'user' });

    expect(action.mock.calls[0][1]).toMatchObject(expected);
  });
});
