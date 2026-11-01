import { Command } from 'commander';
import { assertEnvs, runProcess, setAiDangerousActionConsent } from '../utils';

/**
 * Registers the `migration` command, creating and resetting the database migrations.
 *
 * @param {Command} program - The program to register the command on.
 */
export function migrationCommand(program: Command): void {
  const migration = program
    .command('migration')
    .alias('mgn')
    .description('Create the database migrations and reset the database.');

  migration
    .command('new')
    .description('Create a new database migration and apply it.')
    .argument('<name>', 'Name of the migration, i.e. add_category_to_post.')
    .action(async (name: string) => {
      setAiDangerousActionConsent();
      process.exit(
        await runProcess('prisma', ['migrate', 'dev', '--name', name])
      );
    });

  migration
    .command('reset')
    .description(
      'Reset the database, dropping its data and applying the migrations again.'
    )
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .option(
      '-f, --force',
      'Reset outside the dev and test environments, without a prompt.'
    )
    .action(async (_, command: Command) => {
      const force = command.getOptionValue('force');
      const yes = command.getOptionValue('yes');

      if (!force) {
        assertEnvs(
          ['dev', 'test'],
          '"weaver migration reset" can be called only in "dev" or "test" ' +
            'environments (NODE_ENV=dev). Use --force flag to reset anyway.'
        );
      }

      const args = ['migrate', 'reset'];

      if (yes || force) {
        args.push('--force');
      }

      setAiDangerousActionConsent();
      process.exit(await runProcess('prisma', args));
    });
}
