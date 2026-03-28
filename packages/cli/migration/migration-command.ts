import { Command } from 'commander';
import { assertEnvs, runProcess } from '../utils';

export function migrationCommand(program: Command): void {
  const migration = program
    .command('migration')
    .alias('mgn')
    .description('Database migration commands');

  migration
    .command('new <name>')
    .description('Create a new database migration')
    .action(async (name: string) => {
      await runProcess('prisma', ['migrate', 'dev', '--name', name]);
    });

  migration
    .command('reset')
    .description('Reset the database')
    .option('-f, --force', 'Force reset for non-development environments')
    .option('-y, --yes', 'Skip confirmation prompt')
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

      await runProcess('prisma', args);
    });
}
