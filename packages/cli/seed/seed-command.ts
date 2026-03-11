import { Command } from 'commander';
import { createSeeder } from '@appweaver/core';
import { buildProject } from '../build';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .description('Seed the database')
    .option(
      '--seedersPath [path]',
      'Seeders directory path. (default: from config or env).'
    )
    .option('-b, --buildProject', 'Build the project before seeding.', false)
    .option(
      '-c, --continueOnError',
      'Continue seeder execution if error is thrown.',
      false
    )
    .action(async (_, command: Command) => {
      const seedersPath = command.getOptionValue('seedersPath');
      const continueOnError = command.getOptionValue('continueOnError');

      if (command.getOptionValue('buildProject')) {
        await buildProject();
      }

      const seeder = await createSeeder({ seedersPath, continueOnError });

      await seeder.close();
    });
}
