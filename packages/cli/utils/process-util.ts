import { spawn } from 'node:child_process';

export function runProcess(cmd: string, args: string[] = []) {
  return new Promise((resolve, reject) => {
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, { stdio: 'inherit', shell: true });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code);
    });
  });
}
