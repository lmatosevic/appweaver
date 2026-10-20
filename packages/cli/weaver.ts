#!/usr/bin/env node

process.env.WEAVER_CLI = 'true';

import { spawnSync } from 'node:child_process';
import { Runtime, appConfig } from '@appweaver/common';
import { isBunProcess, loadCliPackageJson } from './utils';

// Restart the same process if the Bun runtime is configured and Bun is
// available on the host machine
if (!isBunProcess() && appConfig.RUNTIME === Runtime.Bun) {
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
import { configCommand } from './config';
import { generateCommand } from './generate';
import { migrateCommand } from './migrate';
import { migrationCommand } from './migration';
import { moduleCommand } from './module';
import { openapiCommand } from './openapi';
import { runCommand } from './run';
import { seedCommand } from './seed';
import { startCommand } from './start';
import { testingCommand } from './testing';
import { upgradeCommand } from './upgrade';

const pkg = loadCliPackageJson();

const program = new Command();

program
  .name('weaver')
  .description('Appweaver CLI - Build and manage your application')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .helpOption('-h, --help', 'Output usage information.')
  .usage('<command> [options]');

buildCommand(program);

configCommand(program);

generateCommand(program);

migrateCommand(program);

migrationCommand(program);

moduleCommand(program);

openapiCommand(program);

runCommand(program);

seedCommand(program);

startCommand(program);

testingCommand(program);

upgradeCommand(program);

program.parse();
