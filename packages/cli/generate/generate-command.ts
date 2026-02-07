import { Command } from 'commander';
import { generateTypes } from './generate-types';
import { generateSchema } from './generate-schema';

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('g')
    .description('Generate types and/or schemas')
    .option('-t, --types', 'Generate TypeScript types.', false)
    .option('-s, --schema', 'Generate Prisma schema.', false)
    .action(async (_, command: Command) => {
      const generateAll =
        !command.getOptionValue('types') && !command.getOptionValue('schema');

      if (command.getOptionValue('types') || generateAll) {
        await generateTypes();
      }

      if (command.getOptionValue('schema') || generateAll) {
        await generateSchema();
      }
    });
}
