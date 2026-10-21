import { Command } from 'commander';
import path from 'node:path';
import { config, configSections } from '@appweaver/common';
import { writeConfigSchema } from '../config/config-schema';
import { generateTypes } from './generate-types';
import { generateSchema } from './generate-schema';
import { importPackage, loadModels } from '../utils';

/**
 * Registers the `generate` command, generating the types and the Prisma schema of the models.
 *
 * @param {Command} program - The program to register the command on.
 */
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
    .option(
      '--no-prune',
      'Keep the framework models the project does not use (auth data model, File, Seeder).'
    )
    .option(
      '--config-schema-path [path]',
      'Output path for the JSON Schema of appweaver.json, written with the types.',
      './appweaver.schema.json'
    )
    .option(
      '--no-config-schema',
      'Skip writing the JSON Schema of appweaver.json.'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      const quiet = !command.getOptionValue('verbose');
      const { databaseConfig, resourceConfig } = await importPackage<
        typeof import('@appweaver/data/config')
      >('@appweaver/data/config', 'generate');

      const generateAll =
        !command.getOptionValue('types') && !command.getOptionValue('schema');

      const models = await loadModels(
        command.getOptionValue('modelPattern') ?? resourceConfig.MODEL_PATTERN,
        command.getOptionValue('prune')
      );

      let typeGenerateResult: number = 0;
      if (command.getOptionValue('types') || generateAll) {
        typeGenerateResult = await generateTypes(
          models,
          command.getOptionValue('typesPath') ??
            resourceConfig.GENERATED_TYPES_PATH,
          quiet,
          command.getOptionValue('registry')
        );

        // Discovering the modules registered the config sections they list
        if (command.getOptionValue('configSchema')) {
          const configSchemaPath = command.getOptionValue('configSchemaPath');
          await writeConfigSchema(configSections.values(), configSchemaPath);
          console.log(
            `Config schema generated to ${path.relative(process.cwd(), configSchemaPath)}`
          );
        }
      }

      let schemaGenerateResult: number = 0;
      if (command.getOptionValue('schema') || generateAll) {
        schemaGenerateResult = await generateSchema(
          models,
          command.getOptionValue('schemaPath') ?? databaseConfig.SCHEMA_PATH,
          command.getOptionValue('clientPath') ??
            databaseConfig.CLIENT_OUTPUT_DIR_PATH,
          quiet
        );
      }

      if (typeGenerateResult !== 0 || schemaGenerateResult !== 0) {
        process.exit(typeGenerateResult || schemaGenerateResult);
      }
    });
}
