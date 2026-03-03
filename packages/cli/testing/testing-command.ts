import fsp from 'node:fs/promises';
import { Command } from 'commander';
import { config } from '@appweaver/common';
import { generateSchema } from '../generate';
import { assertEnv, assertPathInside, loadModels, runProcess } from '../utils';

export function testingCommand(program: Command): void {
  const testCommand = program
    .command('test')
    .alias('t')
    .description('Perform operations used during testing');

  testCommand
    .command('setup')
    .description('Setup temporary test data (database schema and migrations).')
    .option(
      '-d, --dir [tempDir]',
      'Directory used by tests to store temporary data.',
      './temp'
    )
    .option(
      '--modelPattern [pattern]',
      'Glob pattern for finding model files. (default: from config or env).'
    )
    .option(
      '--schemaPath [path]',
      'Output path for generated Prisma schema. (default: from config or env).'
    )
    .option(
      '--clientPath [path]',
      'Output path for generated Prisma client (default: from config or env).'
    )
    .option(
      '--migrationName [name]',
      'Name for the new migration.',
      'init_test'
    )
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test setup" must be started in "test" environment (NODE_ENV=test).'
      );

      const tempDir = command.getOptionValue('dir');

      const storagePath = config.STORAGE_PATH;

      const schemaPath =
        command.getOptionValue('schemaPath') ?? config.DATABASE_SCHEMA_PATH;

      const clientPath =
        command.getOptionValue('clientPath') ??
        config.DATABASE_CLIENT_OUTPUT_PATH;

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

      await runProcess('rimraf', [tempDir]);

      await fsp.mkdir(storagePath, { recursive: true });

      const models = await loadModels(
        command.getOptionValue('modelPattern') ?? config.RESOURCE_MODEL_PATTERN
      );

      await generateSchema(models, schemaPath, clientPath);

      await runProcess('prisma', [
        'migrate',
        'dev',
        '--name',
        command.getOptionValue('migrationName')
      ]);
    });

  testCommand
    .command('reset')
    .description('Reset database and/or file storage in temporary directory.')
    .option(
      '-d, --dir [tempDir]',
      'Directory used by tests to store temporary data.',
      './temp'
    )
    .option('--database', 'Reset database content.')
    .option('--storage', 'Reset storage files.')
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test reset" must be started in "test" environment (NODE_ENV=test).'
      );

      const tempDir = command.getOptionValue('dir');

      const storagePath = config.STORAGE_PATH;

      assertPathInside(
        tempDir,
        storagePath,
        `Storage path must be inside temp directory: ${tempDir}`
      );

      const resetAll =
        !command.getOptionValue('database') &&
        !command.getOptionValue('storage');

      if (command.getOptionValue('database') || resetAll) {
        await runProcess('prisma', ['migrate', 'reset', '-f']);
      }

      if (command.getOptionValue('storage') || resetAll) {
        await runProcess('rimraf', [storagePath]);
      }
    });

  testCommand
    .command('teardown')
    .description('Remove temporary test directory.')
    .option(
      '-d, --dir [tempDir]',
      'Directory used by tests to store temporary data.',
      './temp'
    )
    .action(async (_, command: Command) => {
      assertEnv(
        'test',
        '"weaver test teardown" must be started in "test" environment (NODE_ENV=test).'
      );

      const tempDir = command.getOptionValue('dir');

      await runProcess('rimraf', [tempDir]);
    });
}
