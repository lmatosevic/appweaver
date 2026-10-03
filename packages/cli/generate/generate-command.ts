import { Command } from 'commander';
import { config } from '@appweaver/common';
import { generateTypes } from './generate-types';
import { generateSchema } from './generate-schema';
import { loadModels } from '../utils';

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('g')
    .description('Generate application types and/or schemas.')
    .option('-t, --types', 'Generate TypeScript types.')
    .option('-s, --schema', 'Generate Prisma schema.')
    .option(
      '--model-pattern [pattern]',
      'Glob pattern for finding model files. (default: from config or env).'
    )
    .option(
      '--types-path [path]',
      'Output path for generated types. (default: from config or env).'
    )
    .option(
      '--schema-path [path]',
      'Output path for generated Prisma schema. (default: from config or env).'
    )
    .option(
      '--client-path [path]',
      'Output path for generated Prisma client (default: from config or env).'
    )
    .option(
      '--no-registry',
      'Skip registering the generated types of every model in the resource registry of @appweaver/common.'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      const quiet = !command.getOptionValue('verbose');

      const generateAll =
        !command.getOptionValue('types') && !command.getOptionValue('schema');

      const models = await loadModels(
        command.getOptionValue('modelPattern') ?? config.RESOURCE_MODEL_PATTERN
      );

      let typeGenerateResult: number = 0;
      if (command.getOptionValue('types') || generateAll) {
        typeGenerateResult = await generateTypes(
          models,
          command.getOptionValue('typesPath') ??
            config.RESOURCE_GENERATED_TYPES_PATH,
          quiet,
          command.getOptionValue('registry')
        );
      }

      let schemaGenerateResult: number = 0;
      if (command.getOptionValue('schema') || generateAll) {
        schemaGenerateResult = await generateSchema(
          models,
          command.getOptionValue('schemaPath') ?? config.DATABASE_SCHEMA_PATH,
          command.getOptionValue('clientPath') ??
            config.DATABASE_CLIENT_OUTPUT_DIR_PATH,
          quiet
        );
      }

      if (typeGenerateResult !== 0 || schemaGenerateResult !== 0) {
        process.exit(typeGenerateResult || schemaGenerateResult);
      }
    });
}
