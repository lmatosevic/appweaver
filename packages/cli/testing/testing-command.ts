import fsp from 'node:fs/promises';
import { Command } from 'commander';
import { hasGeo } from '@appweaver/common';
import { storageConfig } from '@appweaver/core/config';
import { generatePrismaSchema } from '../generate';
import {
  assertEnv,
  assertPathInside,
  importPackage,
  loadModels,
  rimrafPath,
  runProcess,
  seriesInDatabase,
  setAiDangerousActionConsent
} from '../utils';

/**
 * Registers the `test` command, setting up, resetting, and tearing down the test environment.
 *
 * @param {Command} program - The program to register the command on.
 */
export function testingCommand(program: Command): void {
  const testCommand = program
    .command('test')
    .alias('t')
    .description('Set up, reset and tear down the test environment.');

  testCommand
    .command('setup')
    .description(
      'Set up the temporary test data: the storage directory, the Prisma schema and the database.'
    )
    .option(
      '--temp-dir <dir>',
      'Directory of the temporary test data.',
      './temp'
    )
    .option(
      '--model-pattern <pattern>',
      'Glob pattern of the model files. (default: from config)'
    )
    .option(
      '--prisma-schema-path <path>',
      'Output path of the Prisma schema. (default: from config)'
    )
    .option(
      '--client-dir <dir>',
      'Output directory of the Prisma client. (default: from config)'
    )
    .option(
      '--migration-name <name>',
      'Name of the initial migration.',
      'init_test'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test setup" must be started in "test" environment (NODE_ENV=test).'
      );

      const quiet = !command.getOptionValue('verbose');
      const { databaseConfig, resourceConfig, spatialProvider } =
        await importPackage<typeof import('@appweaver/data/config')>(
          '@appweaver/data/config',
          'test setup'
        );

      const tempDir = command.getOptionValue('tempDir');

      const storagePath = storageConfig.PATH;

      const schemaPath =
        command.getOptionValue('prismaSchemaPath') ??
        databaseConfig.SCHEMA_PATH;

      const clientPath =
        command.getOptionValue('clientDir') ??
        databaseConfig.CLIENT_OUTPUT_DIR_PATH;

      assertPathInside(
        tempDir,
        storagePath,
        `Storage path must be inside temp directory: ${tempDir}`
      );

      assertPathInside(
        tempDir,
        schemaPath,
        `Schema path must be inside temp directory: ${tempDir}`
      );

      assertPathInside(
        tempDir,
        clientPath,
        `Client output path must be inside temp directory: ${tempDir}`
      );

      await rimrafPath(tempDir, quiet);

      await fsp.mkdir(storagePath, { recursive: true });

      console.log('\nStorage initialized');

      const { models, modules } = await loadModels(
        command.getOptionValue('modelPattern') ?? resourceConfig.MODEL_PATTERN
      );

      const generateStatus = await generatePrismaSchema(
        models,
        schemaPath,
        clientPath,
        quiet,
        seriesInDatabase(modules),
        Object.values(models).some((model) => hasGeo(model.config))
          ? spatialProvider()
          : 'database'
      );
      if (generateStatus !== 0) {
        console.error('Failed to generate Prisma schema');
        process.exit(generateStatus);
      }

      setAiDangerousActionConsent();
      // A database server keeps the tables and the migrations of the last run,
      // which the new migration would conflict with
      const resetStatus = await runProcess(
        'prisma',
        ['migrate', 'reset', '--force'],
        { quiet }
      );
      if (resetStatus !== 0) {
        console.error('Failed to reset the test database');
        process.exit(resetStatus);
      }

      const migrateStatus = await runProcess(
        'prisma',
        ['migrate', 'dev', '--name', command.getOptionValue('migrationName')],
        { quiet }
      );
      if (migrateStatus !== 0) {
        console.error('Failed to generate new migration');
        process.exit(migrateStatus);
      }

      console.log('Database initialized');
    });

  testCommand
    .command('reset')
    .description(
      'Reset the test database and/or the storage files, both without a flag.'
    )
    .option('--database', 'Reset the database.')
    .option('--storage', 'Reset the storage files.')
    .option(
      '--temp-dir <dir>',
      'Directory of the temporary test data.',
      './temp'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test reset" must be started in "test" environment (NODE_ENV=test).'
      );

      const quiet = !command.getOptionValue('verbose');

      const tempDir = command.getOptionValue('tempDir');

      const storagePath = storageConfig.PATH;

      assertPathInside(
        tempDir,
        storagePath,
        `Storage path must be inside temp directory: ${tempDir}`
      );

      const resetAll =
        !command.getOptionValue('database') &&
        !command.getOptionValue('storage');

      if (command.getOptionValue('database') || resetAll) {
        setAiDangerousActionConsent();
        const migrateStatus = await runProcess(
          'prisma',
          ['migrate', 'reset', '-f'],
          { quiet }
        );
        if (migrateStatus !== 0) {
          console.error('Failed to migrate database');
          process.exit(migrateStatus);
        }
        console.log('Database reset');
      }

      if (command.getOptionValue('storage') || resetAll) {
        const result = await rimrafPath(storagePath, quiet);
        if (result) {
          console.log('Storage cleared');
        }
      }
    });

  testCommand
    .command('teardown')
    .description('Remove the temporary test directory.')
    .option(
      '--temp-dir <dir>',
      'Directory of the temporary test data.',
      './temp'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test teardown" must be started in "test" environment (NODE_ENV=test).'
      );

      const quiet = !command.getOptionValue('verbose');

      const tempDir = command.getOptionValue('tempDir');

      const result = await rimrafPath(tempDir, quiet);
      if (result) {
        console.log(`Removed temporary directory ${tempDir}`);
      }
    });
}
