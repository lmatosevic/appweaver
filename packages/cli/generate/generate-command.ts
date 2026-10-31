import { Command } from 'commander';
import path from 'node:path';
import { configSections } from '@appweaver/common';
import { isModuleEnabled } from '@appweaver/core';
import { writeConfigSchema } from '../config/config-schema';
import { generateTypes } from './generate-types';
import { generatePrismaSchema } from './generate-prisma-schema';
import {
  discoverProjectModules,
  importPackage,
  isModulePackage,
  loadModels
} from '../utils';

/** The outputs of `weaver generate`. */
export type GenerateTargets = {
  types: boolean;
  prismaSchema: boolean;
  configSchema: boolean;
};

/** The output flags of `weaver generate`, `configSchema` is `false` with `--no-config-schema`. */
export type GenerateTargetOptions = {
  types?: boolean;
  prismaSchema?: boolean;
  configSchema?: boolean;
};

/**
 * Registers the `generate` command, generating the types and the Prisma schema of the models, and the JSON Schema of
 * `appweaver.json`.
 *
 * @param {Command} program - The program to register the command on.
 */
export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('g')
    .description('Generate application types and/or schemas.')
    .option('-t, --types', 'Generate TypeScript types.')
    .option('-p, --prisma-schema', 'Generate Prisma schema.')
    .option(
      '-c, --config-schema',
      'Generate the JSON Schema of appweaver.json.'
    )
    .option(
      '--model-pattern [pattern]',
      'Glob pattern for finding model files. (default: from config or env).'
    )
    .option(
      '--types-path [path]',
      'Output path for generated types. (default: from config or env).'
    )
    .option(
      '--prisma-schema-path [path]',
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
      'Output path for the JSON Schema of appweaver.json.',
      './appweaver.schema.json'
    )
    .option(
      '--no-config-schema',
      'Skip writing the JSON Schema of appweaver.json when generating everything.'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      const quiet = !command.getOptionValue('verbose');

      // Discovering the modules registers the config sections they list
      const modules = await discoverProjectModules();
      const dataEnabled = isModuleEnabled(modules, '@appweaver/data');
      const options: GenerateTargetOptions = command.opts();
      const targets = generateTargets(options, dataEnabled);

      const selected =
        options.types || options.prismaSchema || options.configSchema === true;
      if (!selected && !dataEnabled) {
        console.log(
          'Skipping the types and the Prisma schema, the @appweaver/data module is not enabled'
        );
      }

      // Written first, so the sections of an importable but disabled @appweaver/data stay out
      if (targets.configSchema) {
        const configSchemaPath = command.getOptionValue('configSchemaPath');
        await writeConfigSchema(
          configSections.values(),
          configSchemaPath,
          modules.flatMap(({ module }) => module.loggers ?? [])
        );
        console.log(
          `Config schema generated to ${path.relative(process.cwd(), configSchemaPath)}`
        );
      }

      let typeGenerateResult: number = 0;
      let schemaGenerateResult: number = 0;
      if (targets.types || targets.prismaSchema) {
        const { databaseConfig, resourceConfig } = await importPackage<
          typeof import('@appweaver/data/config')
        >('@appweaver/data/config', 'generate');

        const registeredByModules = new Set<string>();
        const { models } = await loadModels(
          command.getOptionValue('modelPattern') ??
            resourceConfig.MODEL_PATTERN,
          command.getOptionValue('prune'),
          registeredByModules,
          modules
        );
        if (registeredByModules.size > 0) {
          console.warn(
            `Models registered by their module package, left out of the resource registry: ${[...registeredByModules].join(', ')}`
          );
        }

        if (targets.types) {
          // The registry belongs to the application, a module package registering
          // its models too would conflict with it
          let registry = command.getOptionValue('registry');
          if (registry && (await isModulePackage())) {
            console.log(
              'Skipping the resource registry in a module package, the application registers its models'
            );
            registry = false;
          }

          typeGenerateResult = await generateTypes(
            models,
            command.getOptionValue('typesPath') ??
              resourceConfig.GENERATED_TYPES_PATH,
            quiet,
            registry,
            registeredByModules
          );
        }

        if (targets.prismaSchema) {
          schemaGenerateResult = await generatePrismaSchema(
            models,
            command.getOptionValue('prismaSchemaPath') ??
              databaseConfig.SCHEMA_PATH,
            command.getOptionValue('clientPath') ??
              databaseConfig.CLIENT_OUTPUT_DIR_PATH,
            quiet
          );
        }
      }

      if (typeGenerateResult !== 0 || schemaGenerateResult !== 0) {
        process.exit(typeGenerateResult || schemaGenerateResult);
      }
    });
}

/**
 * Picks the outputs of `weaver generate`: the selected ones, or every one when none is selected, the types and the
 * Prisma schema only with the `@appweaver/data` module enabled, the config schema unless `--no-config-schema` is
 * passed.
 *
 * @param {GenerateTargetOptions} options - The output flags of the command.
 * @param {boolean} dataEnabled - Whether the `@appweaver/data` module is enabled.
 * @return {GenerateTargets} The outputs to generate.
 */
export function generateTargets(
  options: GenerateTargetOptions,
  dataEnabled: boolean
): GenerateTargets {
  const configSchema = options.configSchema === true;
  if (options.types || options.prismaSchema || configSchema) {
    return {
      types: !!options.types,
      prismaSchema: !!options.prismaSchema,
      configSchema
    };
  }

  return {
    types: dataEnabled,
    prismaSchema: dataEnabled,
    configSchema: options.configSchema !== false
  };
}
