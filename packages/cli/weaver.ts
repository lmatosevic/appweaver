#!/usr/bin/env node

process.env.WEAVER_CLI = 'true';

import { spawnSync } from 'node:child_process';
import { config, Runtime } from '@appweaver/common';
import { loadPackageJson, isBunProcess } from './utils';

if (!isBunProcess() && config.APP_RUNTIME === Runtime.Bun) {
  const check = spawnSync('bun --version', {
    stdio: 'ignore',
    shell: true
  });
  if (check.status === 0) {
    const result = spawnSync(`bun ${process.argv.slice(1).join(' ')}`, {
      stdio: 'inherit',
      shell: true
    });
    process.exit(result.status ?? 1);
  }
  // Bun isn't found — fall through to Node execution
}

import { Command } from 'commander';
import { buildCommand } from './build';
import { generateCommand } from './generate';
import { migrateCommand } from './migrate';
import { migrationCommand } from './migration';
import { seedCommand } from './seed';
import { startCommand } from './start';
import { testingCommand } from './testing';

const pkg = loadPackageJson();

const program = new Command();

program
  .name('weaver')
  .description('Appweaver CLI - Build and manage your application')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .usage('<command> [options]')
  .helpOption('-h, --help', 'Output usage information.');

buildCommand(program);

generateCommand(program);

migrateCommand(program);

migrationCommand(program);

seedCommand(program);

startCommand(program);

testingCommand(program);

program.parse();
