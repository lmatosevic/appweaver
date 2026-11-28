import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AGENT_DIRS,
  hasAgentDir,
  SKILL_NAME,
  skillDir,
  syncSkill
} from '../index';

describe('skill', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-skill-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const skillFile = (agentDir: string, ...segments: string[]) =>
    path.join(projectDir, agentDir, 'skills', SKILL_NAME, ...segments);

  describe('skillDir', () => {
    test('resolves the skill of the repository when running from the sources', () => {
      expect(fs.existsSync(path.join(skillDir(), 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillDir(), 'GUIDELINES.md'))).toBe(true);
    });
  });

  describe('hasAgentDir', () => {
    test('tells whether the project has the agent directory', () => {
      fs.mkdirSync(path.join(projectDir, '.claude'));

      expect(hasAgentDir(projectDir, '.claude')).toBe(true);
      expect(hasAgentDir(projectDir, '.agents')).toBe(false);
    });
  });

  describe('syncSkill', () => {
    test('writes the skill into every agent directory the project has', () => {
      fs.mkdirSync(path.join(projectDir, '.claude'));
      fs.mkdirSync(path.join(projectDir, '.github'));

      const written = syncSkill(projectDir);

      expect(written).toEqual([
        path.join('.claude', 'skills', SKILL_NAME),
        path.join('.github', 'skills', SKILL_NAME)
      ]);
      expect(fs.existsSync(skillFile('.claude', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(skillFile('.github', 'references'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.agents'))).toBe(false);
    });

    test('writes nothing to a project without an agent directory', () => {
      expect(syncSkill(projectDir)).toEqual([]);
      expect(fs.readdirSync(projectDir)).toEqual([]);
    });

    test('creates the agent directories it is given', () => {
      expect(syncSkill(projectDir, ['.agents'])).toEqual([
        path.join('.agents', 'skills', SKILL_NAME)
      ]);
      expect(fs.existsSync(skillFile('.agents', 'GUIDELINES.md'))).toBe(true);
    });

    test('removes the files an older version had', () => {
      fs.mkdirSync(skillFile('.claude', 'references'), { recursive: true });
      fs.writeFileSync(skillFile('.claude', 'references', 'removed.md'), '#');

      syncSkill(projectDir);

      expect(
        fs.existsSync(skillFile('.claude', 'references', 'removed.md'))
      ).toBe(false);
      expect(fs.existsSync(skillFile('.claude', 'SKILL.md'))).toBe(true);
    });

    test('leaves the other skills of the agent directory', () => {
      fs.mkdirSync(path.join(projectDir, '.claude', 'skills', 'other'), {
        recursive: true
      });

      syncSkill(projectDir);

      expect(
        fs.existsSync(path.join(projectDir, '.claude', 'skills', 'other'))
      ).toBe(true);
    });
  });

  test('lists the agent directories of the supported agents', () => {
    expect(AGENT_DIRS).toEqual(
      expect.arrayContaining(['.claude', '.agents', '.github'])
    );
  });
});
