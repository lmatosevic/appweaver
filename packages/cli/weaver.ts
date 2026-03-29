#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { config, Runtime } from '@appweaver/common';

if (typeof Bun === 'undefined' && config.APP_RUNTIME === Runtime.Bun) {
  const check = spawnSync('bun --version', { stdio: 'ignore' });
  if (check.status === 0) {
    const result = spawnSync(`bun ${process.argv.slice(1).join(' ')}`, {
      stdio: 'inherit',
      shell: true
    });
    process.exit(result.status ?? 1);
  }
  // Bun isn't found — fall through to Node execution
}

process.env.WEAVER_CLI = 'true';

import { Command } from 'commander';
import { loadPackageJson } from './utils';
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
