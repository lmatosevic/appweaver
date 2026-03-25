import { Command } from 'commander';
import { runProcess } from '../utils';

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
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .action(async (_, command: Command) => {
      const args = ['migrate', 'reset'];
      if (command.getOptionValue('yes')) {
        args.push('--force');
      }
      await runProcess('prisma', args);
    });
}
