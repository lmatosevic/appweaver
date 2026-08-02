import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageRoot = path.join(__dirname, '..');
const skillDir = path.join(packageRoot, 'skill');
const cliVersion = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
).version;

describe('create-weaver-app', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalArgv: string[];
  let createdSkillDir = false;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalArgv = process.argv;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-create-'));
    process.chdir(tempDir);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.argv = originalArgv;
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (createdSkillDir) {
      fs.rmSync(skillDir, { recursive: true, force: true });
      createdSkillDir = false;
    }
    jest.restoreAllMocks();
  });

  /**
   * The skill directory is copied next to the compiled CLI during the build, so
   * it is created temporarily here to exercise the agent files generation.
   */
  const createSkillDir = () => {
    if (fs.existsSync(skillDir)) {
      throw new Error(`Unexpected existing skill directory: ${skillDir}`);
    }
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill', 'utf8');
    fs.writeFileSync(
      path.join(skillDir, 'GUIDELINES.md'),
      '# Guidelines',
      'utf8'
    );
    createdSkillDir = true;
  };

  /** Runs the CLI with the given arguments and waits until it is done. */
  const run = async (...args: string[]): Promise<string[]> => {
    const logs: string[] = [];
    const errors: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...parts: any[]) => {
      logs.push(parts.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...parts: any[]) => {
      errors.push(parts.join(' '));
    });

    process.argv = ['node', 'create-weaver-app', ...args];
    jest.isolateModules(() => {
      // The CLI runs on import, so it must be loaded synchronously here
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../create-weaver-app');
    });

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (errors.length > 0) {
        throw new Error(errors.join('\n'));
      }
      if (logs.some((line) => line.includes('created successfully'))) {
        return logs;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(`CLI did not finish. Output:\n${logs.join('\n')}`);
  };

  const readJson = (...segments: string[]) =>
    JSON.parse(fs.readFileSync(path.join(tempDir, ...segments), 'utf8'));

  const read = (...segments: string[]) =>
    fs.readFileSync(path.join(tempDir, ...segments), 'utf8');

  const exists = (...segments: string[]) =>
    fs.existsSync(path.join(tempDir, ...segments));

  describe('project directory', () => {
    test('creates a directory from the sanitized project name', async () => {
      await run(
        'MyCoolApp',
        'My description',
        '--skipInstall',
        '--agent',
        'none'
      );

      expect(exists('my-cool-app')).toBe(true);
      expect(exists('my-cool-app', 'package.json')).toBe(true);
    });

    test('replaces whitespace in the project name', async () => {
      await run('My App', '--skipInstall', '--agent', 'none');

      expect(exists('my-app')).toBe(true);
    });

    test('uses an explicit output directory', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--outputDir',
        'custom-dir'
      );

      expect(exists('custom-dir', 'package.json')).toBe(true);
      expect(exists('my-app')).toBe(false);
    });

    test('reuses an existing directory', async () => {
      fs.mkdirSync(path.join(tempDir, 'my-app'));

      const logs = await run('MyApp', '--skipInstall', '--agent', 'none');

      expect(logs.join('\n')).toContain('Using existing directory');
      expect(exists('my-app', 'package.json')).toBe(true);
    });
  });

  describe('template processing', () => {
    beforeEach(async () => {
      await run('MyApp', 'My description', '--skipInstall', '--agent', 'none');
    });

    test('replaces the template variables', () => {
      const pkg = readJson('my-app', 'package.json');
      expect(pkg.name).toBe('my-app');
      expect(pkg.description).toBe('My description');

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.app.name).toBe('MyApp');
      expect(config.config.app.description).toBe('My description');
    });

    test('uses the current package version for the framework dependencies', () => {
      const pkg = readJson('my-app', 'package.json');

      expect(pkg.dependencies['@appweaver/core']).toBe(cliVersion);
      expect(pkg.dependencies['@appweaver/cli']).toBe(cliVersion);
      expect(pkg.dependencies['@appweaver/common']).toBe(cliVersion);
    });

    test('removes every template file', () => {
      const remaining = fs
        .readdirSync(path.join(tempDir, 'my-app'), { recursive: true })
        .map(String)
        .filter((file) => /\.(tpl|node|bun)$/.test(file));

      expect(remaining).toEqual([]);
    });

    test('keeps the files of the selected runtime', () => {
      expect(exists('my-app', 'jest.config.json')).toBe(true);
      expect(exists('my-app', 'swc.config.json')).toBe(true);
      expect(exists('my-app', 'test', 'e2e', 'jest.e2e-config.json')).toBe(
        true
      );
    });

    test('generates the project sources and the dotfiles', () => {
      expect(exists('my-app', 'src', 'main.ts')).toBe(true);
      expect(exists('my-app', 'src', 'resources', 'user', 'model.ts')).toBe(
        true
      );
      expect(exists('my-app', 'database', 'schema.prisma')).toBe(true);
      expect(exists('my-app', '.env')).toBe(true);
      expect(exists('my-app', '.gitignore')).toBe(true);
    });

    test('creates the reports directory', () => {
      expect(exists('my-app', 'reports')).toBe(true);
    });
  });

  describe('server options', () => {
    test('uses the default host and port', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.server.host).toBe('0.0.0.0');
      expect(config.config.server.port).toBe(5000);
    });

    test('applies a custom host and port', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--host',
        '127.0.0.1',
        '--port',
        '8080'
      );

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.server.host).toBe('127.0.0.1');
      expect(config.config.server.port).toBe(8080);
    });
  });

  describe('database options', () => {
    test('configures SQLite by default', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.database.url).toBe('file:./data/my-app.db');

      const pkg = readJson('my-app', 'package.json');
      expect(pkg.dependencies).toHaveProperty('@prisma/adapter-better-sqlite3');
      expect(exists('my-app', 'data')).toBe(true);
    });

    test('uses a separate test database url', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      expect(read('my-app', 'appweaver.test.json')).toContain('my-app-test.db');
    });

    test('configures PostgreSQL', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--database',
        'postgresql'
      );

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.database.url).toBe(
        'postgresql://my-app:my-app@localhost:5432/my-app?schema=public'
      );

      const pkg = readJson('my-app', 'package.json');
      expect(pkg.dependencies).toHaveProperty('@prisma/adapter-pg');
      expect(pkg.dependencies).not.toHaveProperty(
        '@prisma/adapter-better-sqlite3'
      );
      expect(exists('my-app', 'data')).toBe(false);

      const compose = read('my-app', 'docker-compose.yml');
      expect(compose).toContain('postgres:18.4');
      expect(compose).toContain('container_name: my-app-postgres');
      expect(compose).toContain('condition: service_healthy');
    });

    test('configures MySQL', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--database',
        'mysql'
      );

      const config = readJson('my-app', 'appweaver.json');
      expect(config.config.database.url).toBe(
        'mysql://my-app:my-app@localhost:3306/my-app'
      );
      expect(readJson('my-app', 'package.json').dependencies).toHaveProperty(
        '@prisma/adapter-mariadb'
      );
      expect(read('my-app', 'docker-compose.yml')).toContain('mariadb:11.4');
    });

    test('adds a named volume for the embedded SQLite database', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      const compose = read('my-app', 'docker-compose.yml');
      expect(compose).toContain('sqlite-data:/usr/app/data');
      expect(compose).not.toContain('image: postgres');
    });
  });

  describe('optional modules', () => {
    test('installs every optional dependency by default', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      const { dependencies } = readJson('my-app', 'package.json');
      expect(dependencies).toHaveProperty('bullmq');
      expect(dependencies).toHaveProperty('cron');
      expect(dependencies).toHaveProperty('ioredis');
      expect(dependencies).toHaveProperty('nodemailer');
    });

    test('skips the dependencies of the disabled modules', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--noQueue',
        '--noCron',
        '--noRedis',
        '--noMailer'
      );

      const { dependencies } = readJson('my-app', 'package.json');
      expect(dependencies).not.toHaveProperty('bullmq');
      expect(dependencies).not.toHaveProperty('cron');
      expect(dependencies).not.toHaveProperty('ioredis');
      expect(dependencies).not.toHaveProperty('nodemailer');
      expect(dependencies).toHaveProperty('@prisma/client');
    });

    test('removes the Docker files with the noDocker flag', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none', '--noDocker');

      expect(exists('my-app', 'Dockerfile')).toBe(false);
      expect(exists('my-app', 'docker-compose.yml')).toBe(false);
    });

    test('generates the Docker files by default', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      expect(exists('my-app', 'Dockerfile')).toBe(true);
      expect(exists('my-app', 'docker-compose.yml')).toBe(true);
      expect(exists('my-app', 'Dockerfile.bun')).toBe(false);
    });
  });

  describe('agent files', () => {
    test('creates the Claude guidelines and the skill files', async () => {
      createSkillDir();

      await run(
        'MyApp',
        'My description',
        '--skipInstall',
        '--agent',
        'claude'
      );

      expect(
        exists('my-app', '.claude', 'skills', 'appweaver', 'SKILL.md')
      ).toBe(true);
      expect(
        exists('my-app', '.claude', 'skills', 'appweaver', 'GUIDELINES.md')
      ).toBe(true);

      const guidelines = read('my-app', 'CLAUDE.md');
      expect(guidelines).toContain('# MyApp');
      expect(guidelines).toContain('My description');
      expect(guidelines).toContain('@.claude/skills/appweaver/GUIDELINES.md');
      expect(guidelines).toContain(
        'Add your own project-specific instructions below this line.'
      );
    });

    test('creates a markdown reference for the other agents', async () => {
      createSkillDir();

      await run('MyApp', '--skipInstall', '--agent', 'codex');

      expect(
        exists('my-app', '.agents', 'skills', 'appweaver', 'SKILL.md')
      ).toBe(true);
      expect(read('my-app', 'AGENTS.md')).toContain(
        '[Appweaver framework guidelines](.agents/skills/appweaver/GUIDELINES.md)'
      );
      expect(exists('my-app', 'CLAUDE.md')).toBe(false);
    });

    test('uses the .github directory for Copilot', async () => {
      createSkillDir();

      await run('MyApp', '--skipInstall', '--agent', 'copilot');

      expect(
        exists('my-app', '.github', 'skills', 'appweaver', 'SKILL.md')
      ).toBe(true);
      expect(read('my-app', 'AGENTS.md')).toContain(
        '.github/skills/appweaver/GUIDELINES.md'
      );
    });

    test('creates no agent files for the none agent', async () => {
      await run('MyApp', '--skipInstall', '--agent', 'none');

      expect(exists('my-app', 'CLAUDE.md')).toBe(false);
      expect(exists('my-app', 'AGENTS.md')).toBe(false);
      expect(exists('my-app', '.claude')).toBe(false);
    });
  });

  describe('option validation', () => {
    const runInvalid = (...args: string[]) => {
      const stderr: string[] = [];
      jest.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
        stderr.push(String(chunk));
        return true;
      });
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      process.argv = ['node', 'create-weaver-app', ...args];

      expect(() =>
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('../create-weaver-app');
        })
      ).toThrow('process.exit called');

      return { stderr: stderr.join(''), exit };
    };

    test('rejects an unsupported database type', () => {
      const { stderr, exit } = runInvalid('MyApp', '--database', 'oracle');

      expect(stderr).toContain('Must be one of following');
      expect(stderr).toContain('sqlite');
      expect(exit).toHaveBeenCalledWith(1);
    });

    test('rejects a port outside of the valid range', () => {
      expect(runInvalid('MyApp', '--port', '70000').stderr).toContain(
        'Must be an integer between 0 and 65535.'
      );
      expect(runInvalid('MyApp', '--port', 'abc').stderr).toContain(
        'Must be an integer between 0 and 65535.'
      );
    });

    test('rejects an unknown agent type', () => {
      const { stderr } = runInvalid('MyApp', '--agent', 'robot');

      expect(stderr).toContain('Must be one of following');
      expect(stderr).toContain('claude');
    });

    test('rejects a missing project name', () => {
      const { stderr } = runInvalid();

      expect(stderr).toContain('name');
    });

    test('accepts an uppercase database type', async () => {
      await run(
        'MyApp',
        '--skipInstall',
        '--agent',
        'none',
        '--database',
        'PostgreSQL'
      );

      expect(
        readJson('my-app', 'appweaver.json').config.database.url
      ).toContain('postgresql://');
    });
  });
});
