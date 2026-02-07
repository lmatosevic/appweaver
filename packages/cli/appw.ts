#!/usr/bin/env node

import { Command } from 'commander';
import { loadPackage } from './utils';
import { buildCommand } from './build';
import { generateCommand } from './generate';
import { migrateCommand } from './migrate';
import { seedCommand } from './seed';
import { startCommand } from './start';

const pkg = loadPackage();

const program = new Command();

program
  .name('appw')
  .description('Appweaver CLI - Build and manage your application')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .usage('<command> [options]')
  .helpOption('-h, --help', 'Output usage information.');

buildCommand(program);

generateCommand(program);

migrateCommand(program);

seedCommand(program);

startCommand(program);

program.parse();
