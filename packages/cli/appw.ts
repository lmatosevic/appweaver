#!/usr/bin/env node

import { Command } from 'commander';
import { generateCommand } from './generate';
import { loadPackage } from './utils';
import { migrateCommand } from './migrate';
import { seedCommand } from './seed';
import { startCommand } from './start';
import { buildCommand } from './build';

const pkg = loadPackage();
const program = new Command();

program
  .name('appw')
  .description('Appweaver CLI - Build and manage your application')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .usage('<command> [options]')
  .helpOption('-h, --help', 'Output usage information.');

generateCommand(program);

buildCommand(program);

startCommand(program);

migrateCommand(program);

seedCommand(program);

program.parse();
