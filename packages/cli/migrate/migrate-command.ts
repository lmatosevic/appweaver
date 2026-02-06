import { Command } from 'commander';
import { spawn } from 'node:child_process';

export function migrateCommand(program: Command): void {
  program
    .command('migrate')
    .alias('m')
    .description('Run database migrations')
    .action(() => {
      spawn('prisma prisma migrate deploy', { stdio: 'inherit', shell: true });
    });
}
