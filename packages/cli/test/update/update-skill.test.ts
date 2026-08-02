import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateSkillFiles } from '../../update/update-skill';

// The skill directory is copied next to the compiled CLI during the build, so
// it is created temporarily here to exercise the copy behaviour.
const skillDir = path.join(__dirname, '..', '..', 'skill');

describe('update-skill', () => {
  let tempDir: string;
  let originalCwd: string;
  let createdSkillDir = false;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-skill-'));
    process.chdir(tempDir);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (createdSkillDir) {
      fs.rmSync(skillDir, { recursive: true, force: true });
      createdSkillDir = false;
    }
    jest.restoreAllMocks();
  });

  const createSkillDir = () => {
    if (fs.existsSync(skillDir)) {
      throw new Error(`Unexpected existing skill directory: ${skillDir}`);
    }
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill', 'utf8');
    fs.writeFileSync(
      path.join(skillDir, 'GUIDELINES.md'),
      '# Guidelines',
      'utf8'
    );
    fs.writeFileSync(
      path.join(skillDir, 'references', 'configuration.md'),
      '# Configuration',
      'utf8'
    );
    createdSkillDir = true;
  };

  const skillPath = (agentDir: string, ...segments: string[]) =>
    path.join(tempDir, agentDir, 'skills', 'appweaver', ...segments);

  describe('updateSkillFiles', () => {
    test('warns and does nothing when the skill directory is missing', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'));

      await updateSkillFiles(false);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skill directory not found')
      );
      expect(fs.existsSync(skillPath('.claude'))).toBe(false);
    });

    test('stays silent when the skill directory is missing and quiet is set', async () => {
      await updateSkillFiles(true);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test('copies the skill files into an existing agent directory', async () => {
      createSkillDir();
      fs.mkdirSync(path.join(tempDir, '.claude'));

      await updateSkillFiles(true);

      expect(fs.readFileSync(skillPath('.claude', 'SKILL.md'), 'utf8')).toBe(
        '# Skill'
      );
      expect(
        fs.readFileSync(skillPath('.claude', 'GUIDELINES.md'), 'utf8')
      ).toBe('# Guidelines');
      expect(
        fs.readFileSync(
          skillPath('.claude', 'references', 'configuration.md'),
          'utf8'
        )
      ).toBe('# Configuration');
    });

    test('copies the skill files into every known agent directory', async () => {
      createSkillDir();
      for (const agentDir of ['.claude', '.github', '.agents']) {
        fs.mkdirSync(path.join(tempDir, agentDir));
      }

      await updateSkillFiles(true);

      for (const agentDir of ['.claude', '.github', '.agents']) {
        expect(fs.existsSync(skillPath(agentDir, 'SKILL.md'))).toBe(true);
      }
    });

    test('skips agent directories that do not exist', async () => {
      createSkillDir();
      fs.mkdirSync(path.join(tempDir, '.claude'));

      await updateSkillFiles(true);

      expect(fs.existsSync(path.join(tempDir, '.agents'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, '.junie'))).toBe(false);
    });

    test('never touches the project root guidelines file', async () => {
      createSkillDir();
      fs.mkdirSync(path.join(tempDir, '.claude'));
      fs.writeFileSync(
        path.join(tempDir, 'CLAUDE.md'),
        '# My project rules',
        'utf8'
      );

      await updateSkillFiles(true);

      expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf8')).toBe(
        '# My project rules'
      );
    });

    test('overwrites previously copied skill files', async () => {
      createSkillDir();
      fs.mkdirSync(skillPath('.claude'), { recursive: true });
      fs.writeFileSync(skillPath('.claude', 'SKILL.md'), '# Outdated', 'utf8');

      await updateSkillFiles(true);

      expect(fs.readFileSync(skillPath('.claude', 'SKILL.md'), 'utf8')).toBe(
        '# Skill'
      );
    });

    test('logs the updated directories when not quiet', async () => {
      createSkillDir();
      fs.mkdirSync(path.join(tempDir, '.claude'));

      await updateSkillFiles(false);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(path.join('.claude', 'skills', 'appweaver'))
      );
    });
  });
});
