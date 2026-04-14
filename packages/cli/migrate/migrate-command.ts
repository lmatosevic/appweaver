import { Command } from 'commander';
import { runProcess } from '../utils';

export function migrateCommand(program: Command): void {
  program
    .command('migrate')
    .alias('mge')
    .description('Run database migrations.')
    .action(async () => {
      process.exit(await runProcess('prisma', ['migrate', 'deploy']));
    });
}
