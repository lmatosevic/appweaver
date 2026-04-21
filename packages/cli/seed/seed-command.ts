import { Command } from 'commander';
import { createSeeder } from '@appweaver/core';
import { buildProject } from '../build';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .alias('sd')
    .description('Seed the database.')
    .option(
      '--seedersPath [path]',
      'Seeders directory path. (default: from config or env).'
    )
    .option('-b, --buildProject', 'Build the project before seeding.')
    .option(
      '-p, --project [path]',
      'TypeScript project config file.',
      'tsconfig.build.json'
    )
    .option(
      '-c, --continueOnError',
      'Continue seeder execution if error is thrown.'
    )
    .option(
      '-f, --fixWarnings',
      'Fix all seeder warnings like wrong checksum or deleted seeder files.'
    )
    .action(async (_, command: Command) => {
      const seedersPath = command.getOptionValue('seedersPath');
      const projectFile = command.getOptionValue('project');
      const continueOnError = command.getOptionValue('continueOnError');
      const fixWarnings = command.getOptionValue('fixWarnings');

      if (command.getOptionValue('buildProject')) {
        await buildProject(projectFile);
      }

      const seeder = await createSeeder({
        seedersPath,
        continueOnError,
        fixWarnings
      });

      await seeder.close();

      // Exit process in case there are any open handlers left
      process.exit(0);
    });
}
