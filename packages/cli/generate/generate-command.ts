import { Command } from 'commander';
import { generateTypes } from './generate-types';
import { generateSchema } from './generate-schema';
import { loadModels } from '../utils';

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('g')
    .description('Generate types and/or schemas')
    .option('-t, --types', 'Generate TypeScript types.', false)
    .option('-s, --schema', 'Generate Prisma schema.', false)
    .option(
      '--modelPattern [pattern]',
      'Glob pattern for finding model files.',
      './src/resources/*/model.ts'
    )
    .option(
      '--typesPath [path]',
      'Output path for generated types.',
      './src/types/generated.ts'
    )
    .option(
      '--schemaPath [path]',
      'Output path for generated schema.',
      './database/schema.prisma'
    )
    .action(async (_, command: Command) => {
      const generateAll =
        !command.getOptionValue('types') && !command.getOptionValue('schema');

      const models = loadModels(command.getOptionValue('modelPattern'));

      if (command.getOptionValue('types') || generateAll) {
        await generateTypes(models, command.getOptionValue('typesPath'));
      }

      if (command.getOptionValue('schema') || generateAll) {
        await generateSchema(models, command.getOptionValue('schemaPath'));
      }
    });
}
