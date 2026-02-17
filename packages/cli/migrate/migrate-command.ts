import { Command } from 'commander';
import { runProcess } from '../utils';

export function migrateCommand(program: Command): void {
  program
    .command('migrate')
    .alias('m')
    .description('Run database migrations')
    .action(async () => {
      await runProcess('prisma', ['migrate', 'deploy']);
    });
}
