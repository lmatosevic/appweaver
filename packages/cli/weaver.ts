#!/usr/bin/env node

process.env.WEAVER_CLI = 'true';

import { spawnSync } from 'node:child_process';
import { config, Runtime } from '@appweaver/common';
import { isBunProcess, loadCliPackageJson } from './utils';

// Restart the same process if the Bun runtime is configured and Bun is
// available on the host machine
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

// These imports should be added after resolving current runtime to avoid
// unnecessary loading of all dependencies
import { Command } from 'commander';
import { buildCommand } from './build';
import { generateCommand } from './generate';
import { migrateCommand } from './migrate';
import { migrationCommand } from './migration';
import { seedCommand } from './seed';
import { specCommand } from './spec';
import { startCommand } from './start';
import { testingCommand } from './testing';
import { updateCommand } from './update';

const pkg = loadCliPackageJson();

const program = new Command();

program
  .name('weaver')
  .description('Appweaver CLI - Build and manage your application')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .helpOption('-h, --help', 'Output usage information.')
  .usage('<command> [options]');

buildCommand(program);

specCommand(program);

generateCommand(program);

migrateCommand(program);

migrationCommand(program);

seedCommand(program);

startCommand(program);

testingCommand(program);

updateCommand(program);

program.parse();
