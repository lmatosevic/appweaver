import { Command } from 'commander';
import { generateTypes } from './generate-types';
import { generateSchema } from './generate-schema';
import { loadResources } from '../utils';

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

      const resources = loadResources();

      if (command.getOptionValue('types') || generateAll) {
        await generateTypes(resources);
      }

      if (command.getOptionValue('schema') || generateAll) {
        await generateSchema(resources);
      }
    });
}
