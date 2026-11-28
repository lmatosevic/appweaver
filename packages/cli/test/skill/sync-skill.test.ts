import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncProjectSkill } from '../../skill/sync-skill';

describe('sync-skill', () => {
  let projectDir: string;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-skill-'));
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    jest.dontMock('@appweaver/skill');
    jest.resetModules();
  });

  const skillFile = (agentDir: string) =>
    path.join(projectDir, agentDir, 'skills', 'appweaver', 'SKILL.md');

  describe('syncProjectSkill', () => {
    test('copies the skill into the agent directories and names them', async () => {
      fs.mkdirSync(path.join(projectDir, '.claude'));

      await expect(syncProjectSkill(projectDir)).resolves.toBe(true);

      expect(fs.existsSync(skillFile('.claude'))).toBe(true);
      expect(log).toHaveBeenCalledWith(
        `Updated skill files in ${path.join('.claude', 'skills', 'appweaver')}`
      );
    });

    test('prints nothing when quiet', async () => {
      fs.mkdirSync(path.join(projectDir, '.agents'));

      await syncProjectSkill(projectDir, { quiet: true });

      expect(fs.existsSync(skillFile('.agents'))).toBe(true);
      expect(log).not.toHaveBeenCalled();
    });

    test('reports a project without an agent directory', async () => {
      await syncProjectSkill(projectDir);

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('No agent directory found')
      );
    });

    test('prints the directories of a dry run without writing them', async () => {
      fs.mkdirSync(path.join(projectDir, '.claude'));

      await syncProjectSkill(projectDir, { dryRun: true });

      expect(fs.existsSync(skillFile('.claude'))).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('.claude/skills/appweaver')
      );
    });

    test('reports a dry run without an agent directory', async () => {
      await syncProjectSkill(projectDir, { dryRun: true });

      expect(log).toHaveBeenCalledWith('No agent directory found.');
    });

    test('warns when the project does not have @appweaver/skill', async () => {
      jest.resetModules();
      jest.doMock('@appweaver/skill', () => {
        const error = new Error(
          "Cannot find module '@appweaver/skill'"
        ) as NodeJS.ErrnoException;
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      });
      const { syncProjectSkill: sync } = await import('../../skill/sync-skill');

      await expect(sync(projectDir)).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('npm install --save-dev @appweaver/skill')
      );
    });

    test('throws any other error of the skill package', async () => {
      jest.resetModules();
      jest.doMock('@appweaver/skill', () => {
        throw new Error('broken');
      });
      const { syncProjectSkill: sync } = await import('../../skill/sync-skill');

      await expect(sync(projectDir)).rejects.toThrow('broken');
    });
  });
});
