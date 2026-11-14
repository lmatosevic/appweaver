import { Command } from 'commander';
import { importPackage } from '../utils';
import { buildProject } from '../build';

/**
 * Registers the `seed` command, seeding the database.
 *
 * @param {Command} program - The program to register the command on.
 */
export function seedCommand(program: Command): void {
  program
    .command('seed')
    .alias('sd')
    .description('Seed the database.')
    .option('--build-project', 'Build the project before seeding.')
    .option(
      '-p, --project <path>',
      'TypeScript project config file of --build-project.',
      'tsconfig.build.json'
    )
    .option(
      '--seeders-dir <dir>',
      'Directory of the seeders. (default: from config)'
    )
    .option(
      '--continue-on-error',
      'Continue running the seeders when one throws an error.'
    )
    .option(
      '--fix-warnings',
      'Fix the seeder warnings, like a wrong checksum or a deleted seeder file.'
    )
    .option(
      '--dry-run',
      'Print the pending seeders and the warnings to fix without running them.'
    )
    .action(async (_, command: Command) => {
      const seedersPath = command.getOptionValue('seedersDir');
      const projectFile = command.getOptionValue('project');
      const continueOnError = command.getOptionValue('continueOnError');
      const fixWarnings = command.getOptionValue('fixWarnings');
      const dryRun = command.getOptionValue('dryRun');

      if (command.getOptionValue('buildProject')) {
        await buildProject(projectFile);
      }

      const { createSeeder } = await importPackage<
        typeof import('@appweaver/data')
      >('@appweaver/data', 'seed');
      const seeder = await createSeeder({
        seedersPath,
        continueOnError,
        fixWarnings,
        dryRun
      });

      await seeder.close();

      // Exit process in case there are any open handlers left
      process.exit(0);
    });
}
