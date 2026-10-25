import path from 'node:path';
import { Command } from 'commander';
import { appConfig, configSections } from '@appweaver/common';
import { writeConfigSchema } from './config-schema';
import { formatConfigRows, readConfigReport } from './config-report';

/**
 * Creates the application without starting it, so every module and file of the application has defined its config
 * sections.
 */
async function loadSections() {
  const { createApp } = await import('@appweaver/core');
  await createApp({ autoStart: false });
  return configSections.values();
}

/** The logger names of the modules enabled by {@link loadSections}. */
async function loadLoggerNames() {
  const { context } = await import('@appweaver/core/internal');
  return context.modules.enabled.flatMap((module) => module.loggerNames ?? []);
}

/**
 * Registers the `config` command, generating the JSON Schema of the config, printing and checking its values.
 *
 * @param {Command} program - The program to register the command on.
 */
export function configCommand(program: Command): void {
  const command = program
    .command('config')
    .alias('cfg')
    .description('Inspect the configuration of the application.');

  command
    .command('schema')
    .description(
      'Generate the JSON Schema of appweaver.json from the config sections of the enabled modules.'
    )
    .option(
      '-o, --output-path [path]',
      'Output path for the generated JSON Schema.',
      './appweaver.schema.json'
    )
    .action(async (_, subcommand: Command) => {
      const outputPath = subcommand.getOptionValue('outputPath');
      try {
        await writeConfigSchema(
          await loadSections(),
          outputPath,
          await loadLoggerNames()
        );
        console.log(
          `Schema generated to ${path.relative(process.cwd(), outputPath)}, point the $schema of appweaver.json to it`
        );
        process.exit(0);
      } catch (error) {
        console.error('Schema generation failed', error);
        process.exit(1);
      }
    });

  command
    .command('print')
    .description(
      'Print every config value with its source (env, json, default), the secrets hidden.'
    )
    .action(async () => {
      const { rows, errors } = readConfigReport(await loadSections());
      console.log(`Environment: ${appConfig.ENV}\n`);
      formatConfigRows(rows).forEach((line) => console.log(line));
      errors.forEach((error) => console.error(`\n${error}`));
      process.exit(errors.length > 0 ? 1 : 0);
    });

  command
    .command('check')
    .description(
      'Validate the config of every enabled module, i.e. NODE_ENV=prod weaver config check in CI.'
    )
    .action(async () => {
      let errors: string[];
      try {
        errors = readConfigReport(await loadSections()).errors;
      } catch (error) {
        errors = [(error as Error).message];
      }
      if (errors.length > 0) {
        errors.forEach((error) => console.error(error));
        process.exit(1);
      }
      console.log(`Config of the "${appConfig.ENV}" environment is valid`);
      process.exit(0);
    });
}
