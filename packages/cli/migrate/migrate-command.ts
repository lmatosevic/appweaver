import { Command } from 'commander';
import { runProcess } from '../utils';

/**
 * Registers the `migrate` command, applying the pending database migrations.
 *
 * @param {Command} program - The program to register the command on.
 */
export function migrateCommand(program: Command): void {
  program
    .command('migrate')
    .alias('mge')
    .description('Run database migrations.')
    .action(async () => {
      process.exit(await runProcess('prisma', ['migrate', 'deploy']));
    });
}
