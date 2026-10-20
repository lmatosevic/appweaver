import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { disableModules, enableModules } from '../../scaffold/apply-modules';
import { createProject } from '../../scaffold/create-project';
import { loadProject } from '../../scaffold/load-project';
import {
  DatabaseType,
  ModuleName,
  moduleNames,
  Runtime
} from '../../scaffold/types';

describe('apply-modules', () => {
  let tempDir: string;
  let count = 0;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-modules-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Creates a project in a new directory of the temporary one. */
  const create = async (
    modules: ModuleName[],
    options: { database?: DatabaseType; runtime?: Runtime } = {}
  ): Promise<string> => {
    const dir = path.join(tempDir, `project-${count++}`);
    await createProject({
      dir,
      name: 'MyApp',
      packageName: 'my-app',
      description: 'My description',
      host: '0.0.0.0',
      port: 5000,
      database: options.database ?? 'postgresql',
      runtime: options.runtime ?? 'node',
      modules
    });
    return dir;
  };

  /** Adds the modules one at a time, the way `weaver module add` does. */
  const add = async (dir: string, ...modules: ModuleName[]) => {
    for (const name of modules) {
      const { files, context, enabled } = loadProject(dir);
      const result = enableModules(files, context, enabled, [name]);
      await files.commit();
      expect(result.warnings).toEqual([]);
    }
  };

  /** Removes the modules one at a time, the way `weaver module remove` does. */
  const remove = async (dir: string, ...modules: ModuleName[]) => {
    for (const name of modules) {
      const { files, context, enabled } = loadProject(dir);
      const result = disableModules(files, context, enabled, [name]);
      await files.commit();
      expect(result.warnings).toEqual([]);
    }
  };

  /** Reads every file of a project, parsing the JSON files so their key order does not matter. */
  const snapshot = (dir: string): Record<string, unknown> =>
    Object.fromEntries(
      fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const file = path.join(entry.parentPath, entry.name);
          const content = fs.readFileSync(file, 'utf8');
          return [
            path.relative(dir, file),
            file.endsWith('.json') ? JSON.parse(content) : content
          ];
        })
    );

  const read = (dir: string, file: string) =>
    fs.readFileSync(path.join(dir, file), 'utf8');

  /** Every combination of the modules that includes the modules each one requires. */
  const combinations = (): ModuleName[][] =>
    Array.from({ length: 2 ** moduleNames.length }, (_, mask) =>
      moduleNames.filter((_, i) => mask & (1 << i))
    ).filter((names) => !names.includes('queue') || names.includes('redis'));

  describe('enableModules', () => {
    test('adds every combination of modules like a created project', async () => {
      for (const modules of combinations()) {
        const created = await create(modules);
        const added = await create([]);
        // Added in the reverse order they are applied, to cover every integration
        await add(added, ...[...modules].reverse());

        expect([modules, snapshot(added)]).toEqual([
          modules,
          snapshot(created)
        ]);
      }
    }, 120_000);

    test.each([
      ['sqlite', 'node'],
      ['mysql', 'node'],
      ['sqlserver', 'node'],
      ['sqlite', 'bun']
    ] as [DatabaseType, Runtime][])(
      'adds the modules to a %s %s project like a created one',
      async (database, runtime) => {
        const created = await create([...moduleNames], { database, runtime });
        const added = await create([], { database, runtime });
        await add(added, 'docker', 'locales', 'redis', 'templates', 'mailer');
        await add(added, 'scheduler', 'queue');

        expect(snapshot(added)).toEqual(snapshot(created));
      }
    );

    test('skips the existing files that differ, unless forced', async () => {
      const dir = await create([]);
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch\n');

      const { files, context, enabled } = loadProject(dir);
      expect(enabled).toEqual(['docker']);

      const skipped = enableModules(files, context, [], ['docker']);
      expect(skipped.warnings).toEqual([
        'Skipped the existing file Dockerfile'
      ]);
      expect(files.read('Dockerfile')).toBe('FROM scratch\n');

      const forced = enableModules(files, context, [], ['docker'], {
        force: true
      });
      expect(forced.warnings).toEqual([]);
      expect(files.read('Dockerfile')).toContain('FROM node:');
    });

    test('restores the translation calls of the unchanged templates only', async () => {
      const dir = await create(['mailer', 'templates']);
      const edited = 'templates/emails/verify-email.subject.hbs';
      fs.writeFileSync(path.join(dir, edited), 'Welcome!\n');

      await add(dir, 'locales');

      expect(read(dir, edited)).toBe('Welcome!\n');
      expect(
        read(dir, 'templates/emails/password-reset.subject.hbs')
      ).toContain('{{t "emails.passwordReset.subject"}}');
    });

    test('reports whether the dependencies changed', async () => {
      const dir = await create([]);
      const { files, context } = loadProject(dir);

      expect(
        enableModules(files, context, [], ['locales']).packagesChanged
      ).toBe(false);
      expect(
        enableModules(files, context, ['locales'], ['mailer']).packagesChanged
      ).toBe(true);
    });
  });

  describe('disableModules', () => {
    test('removes every combination of modules like a created project', async () => {
      for (const modules of combinations()) {
        const created = await create(modules);
        const removed = await create([...moduleNames]);
        await remove(
          removed,
          ...[...moduleNames]
            .reverse()
            .filter((name) => !modules.includes(name))
        );

        expect([modules, snapshot(removed)]).toEqual([
          modules,
          snapshot(created)
        ]);
      }
    }, 120_000);

    test('deletes the template, translation and Docker files', async () => {
      const dir = await create([...moduleNames]);
      fs.writeFileSync(path.join(dir, 'templates', 'page.html.hbs'), '<p/>');
      fs.writeFileSync(path.join(dir, 'locales', 'de.json'), '{}');

      await remove(dir, 'templates', 'locales', 'docker');

      for (const file of [
        'templates',
        'locales',
        'Dockerfile',
        '.dockerignore',
        'docker-compose.yml',
        'start.sh'
      ]) {
        expect(fs.existsSync(path.join(dir, file))).toBe(false);
      }
      expect(fs.existsSync(path.join(dir, 'database', 'schema.prisma'))).toBe(
        true
      );
    });

    test('deletes the email templates with the mailer, keeping the others', async () => {
      const dir = await create(['mailer', 'templates', 'locales']);
      fs.writeFileSync(path.join(dir, 'templates', 'page.html.hbs'), '<p/>');

      await remove(dir, 'mailer');

      expect(fs.readdirSync(path.join(dir, 'templates')).sort()).toEqual([
        '.gitkeep',
        'page.html.hbs'
      ]);
    });

    test('writes the English texts of the translation file into the templates', async () => {
      const dir = await create(['templates', 'locales']);
      fs.writeFileSync(
        path.join(dir, 'templates', 'page.html.hbs'),
        '<h1>{{t "page.title" name=user}}</h1>'
      );
      const translations = JSON.parse(read(dir, 'locales/en.json'));
      fs.writeFileSync(
        path.join(dir, 'locales', 'en.json'),
        JSON.stringify({ ...translations, page: { title: 'Hi {name}' } })
      );

      await remove(dir, 'locales');

      expect(read(dir, 'templates/page.html.hbs')).toBe('<h1>Hi {{user}}</h1>');
    });

    test('reports a template whose translation is missing', async () => {
      const dir = await create(['templates', 'locales']);
      const page = '<h1>{{t "page.title"}}</h1>';
      fs.writeFileSync(path.join(dir, 'templates', 'page.html.hbs'), page);

      const { files, context, enabled } = loadProject(dir);
      const { warnings } = disableModules(files, context, enabled, ['locales']);

      expect(warnings).toEqual([
        expect.stringContaining(
          'Unable to write the English texts into templates/page.html.hbs'
        )
      ]);
      expect(files.read('templates/page.html.hbs')).toBe(page);
    });

    test('keeps the configuration values changed in the project', async () => {
      const dir = await create(['scheduler']);
      const configFile = path.join(dir, 'appweaver.json');
      const appConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      appConfig.environments.test.scheduler.autoStartJob = true;
      fs.writeFileSync(configFile, JSON.stringify(appConfig));

      await remove(dir, 'scheduler');

      const { config, environments } = JSON.parse(
        fs.readFileSync(configFile, 'utf8')
      );
      expect(config).not.toHaveProperty('scheduler');
      expect(environments.test.scheduler).toEqual({ autoStartJob: true });
    });
  });
});
