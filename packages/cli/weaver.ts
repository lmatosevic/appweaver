#!/usr/bin/env node

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
