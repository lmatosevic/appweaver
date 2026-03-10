import { Command } from 'commander';
import { createSeeder } from '@appweaver/core';
import { runProcess } from '../utils';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .description('Seed the database')
    .option(
      '--seedersPath [path]',
      'Seeders directory path. (default: from config or env).'
    )
    .option(
      '-s, --skipBuild',
      'Skip building the project before seeding.',
      false
    )
    .option(
      '-c, --continueOnError',
      'Continue seeder execution if error is thrown.',
      false
    )
    .action(async (_, command: Command) => {
      const seedersPath = command.getOptionValue('seedersPath');
      const continueOnError = command.getOptionValue('continueOnError');

      if (!command.getOptionValue('skipBuild')) {
        await runProcess('rimraf', ['dist']);
        await runProcess('tsc', ['-p tsconfig.build.json']);
        await runProcess('tsc-alias', ['-p tsconfig.build.json']);
      }

      await createSeeder({ seedersPath, continueOnError });
    });
}
