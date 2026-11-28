// fkill is ESM only, and the check loads the schema generation, never run here
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../migration/check-migration', () => ({
  checkMigration: jest.fn()
}));

const runProcess = jest.fn<Promise<number>, any[]>();
const setAiDangerousActionConsent = jest.fn();

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  runProcess: (...args: any[]) => runProcess(...args),
  setAiDangerousActionConsent: () => setAiDangerousActionConsent()
}));

import { Command } from 'commander';
import { migrationCommand } from '../../migration';

describe('migrationCommand', () => {
  const run = async (...args: string[]) => {
    const program = new Command('weaver').exitOverride();
    migrationCommand(program);
    await program.parseAsync(['node', 'weaver', 'migration', ...args]);
  };

  beforeEach(() => {
    runProcess.mockReset().mockResolvedValue(0);
    setAiDangerousActionConsent.mockReset();
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('new', () => {
    test('creates the migration and applies it', async () => {
      await run('new', 'add_category_to_post');

      expect(setAiDangerousActionConsent).toHaveBeenCalled();
      expect(runProcess).toHaveBeenCalledWith('prisma', [
        'migrate',
        'dev',
        '--name',
        'add_category_to_post'
      ]);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('creates the migration without applying it with --create-only', async () => {
      await run('new', 'post_search', '--create-only');

      expect(runProcess).toHaveBeenCalledWith('prisma', [
        'migrate',
        'dev',
        '--name',
        'post_search',
        '--create-only'
      ]);
    });

    test('exits with the code of Prisma', async () => {
      runProcess.mockResolvedValue(1);

      await run('new', 'broken');

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
