import { Command } from 'commander';
import { runProcess } from '../utils';

export function migrationCommand(program: Command): void {
  program
    .command('migration')
    .alias('mgn')
    .description('Create new database migration')
    .option('-n, --name <NAME>', 'Name for the new migration.')
    .action(async (_, command: Command) => {
      const name = command.getOptionValue('name');
      await runProcess('prisma', ['migrate', 'dev', '--name', name]);
    });
}
