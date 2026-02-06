import { Command } from 'commander';
import { generateTypes } from './generate-types';

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('g')
    .description('Generate types and schemas')
    .action(generateTypes);
}
