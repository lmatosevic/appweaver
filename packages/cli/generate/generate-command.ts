import { Command } from 'commander';
import { config } from '@appweaver/common';
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
      'Glob pattern for finding model files. (default: from config or env).'
    )
    .option(
      '--typesPath [path]',
      'Output path for generated types. (default: from config or env).'
    )
    .option(
      '--schemaPath [path]',
      'Output path for generated Prisma schema. (default: from config or env).'
    )
    .option(
      '--clientPath [path]',
      'Output path for generated Prisma client (default: from config or env).'
    )
    .option('-v, --verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      const quiet = !command.getOptionValue('verbose');

      const generateAll =
        !command.getOptionValue('types') && !command.getOptionValue('schema');

      const models = await loadModels(
        command.getOptionValue('modelPattern') ?? config.RESOURCE_MODEL_PATTERN
      );

      if (command.getOptionValue('types') || generateAll) {
        await generateTypes(
          models,
          command.getOptionValue('typesPath') ??
            config.RESOURCE_GENERATED_TYPES_PATH,
          quiet
        );
      }

      if (command.getOptionValue('schema') || generateAll) {
        await generateSchema(
          models,
          command.getOptionValue('schemaPath') ?? config.DATABASE_SCHEMA_PATH,
          command.getOptionValue('clientPath') ??
            config.DATABASE_CLIENT_OUTPUT_PATH,
          quiet
        );
      }
    });
}
