#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { generateCommand } from './commands';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
);

const program = new Command();

program
  .name('weaver-client')
  .description(
    'Weaver Client - generate client code and use any Appweaver compatible API'
  )
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .helpOption('-h, --help', 'Output usage information.')
  .usage('<command> [options]');

generateCommand(program);

program.parse();
