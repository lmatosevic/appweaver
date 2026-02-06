import { Command } from 'commander';
import { spawn } from 'node:child_process';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .description('Seed the database')
    .action(() => {
      spawn('ts-node -r tsconfig-paths/register ./database/seeder/index.ts', {
        stdio: 'inherit',
        shell: true
      });
    });
}
