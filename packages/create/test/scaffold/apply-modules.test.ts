import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultTranslations } from '../../../core/locale/default-translations';
import { disableModules, enableModules } from '../../scaffold/apply-modules';
import { createProject } from '../../scaffold/create-project';
import { loadProject } from '../../scaffold/load-project';
import { ProjectFiles } from '../../scaffold/project-files';
import {
  DatabaseType,
  ModuleName,
  moduleNames,
  Runtime
} from '../../scaffold/types';

// The template files never change, so each one is read once for the hundreds
// of projects the tests create
jest.mock('../../scaffold/template-files', () => {
  const actual = jest.requireActual('../../scaffold/template-files');
  const cache = new Map<string, unknown>();
  const cached =
    (fn: (...args: any[]) => unknown) =>
    (...args: any[]) => {
      const key = JSON.stringify(args);
      if (!cache.has(key)) {
        cache.set(key, fn(...args));
      }
      return cache.get(key);
    };
  return {
    ...actual,
    collectTemplateFiles: cached(actual.collectTemplateFiles),
    readTemplateFile: cached(actual.readTemplateFile)
  };
});

/** Files kept in memory, a commit leaving the staged changes in place. */
class MemoryFiles extends ProjectFiles {
  public override async commit(): Promise<void> {}
}

describe('apply-modules', () => {
  let tempDir: string;
  let count = 0;
  const createdSnapshots = new Map<string, Record<string, unknown>>();
  /** The database of each project, which the data module is added with. */
  const databases = new Map<string, DatabaseType>();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-modules-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** A project on disk by its directory, or one staged in memory. */
  type Project = string | ProjectFiles;

  /** Creates a project in a new directory of the temporary one. */
  const create = async (
    modules: ModuleName[],
    options: { database?: DatabaseType; runtime?: Runtime } = {}
  ): Promise<string> => {
    const dir = path.join(tempDir, `project-${count++}`);
    await createProject(projectOptions(dir, modules, options));
    databases.set(dir, options.database ?? 'postgresql');
    return dir;
  };

  /** Creates a project staged in memory, since writing it to disk takes most of the time of a test. */
  const stage = async (modules: ModuleName[]): Promise<ProjectFiles> => {
    const files = new MemoryFiles(path.join(tempDir, `project-${count++}`));
    await createProject(projectOptions(files.dir, modules), files);
    return files;
  };

  const projectOptions = (
    dir: string,
    modules: ModuleName[],
    options: { database?: DatabaseType; runtime?: Runtime } = {}
  ) => ({
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

  /** Loads a project, with the database the data module is added with, like `weaver module add --database`. */
  const load = (project: Project) => {
    const loaded =
      typeof project === 'string'
        ? loadProject(project)
        : loadProject(project.dir, project);
    const dir = typeof project === 'string' ? project : project.dir;
    if (!loaded.enabled.includes('data')) {
      loaded.context.database = databases.get(dir) ?? 'postgresql';
    }
    return loaded;
  };

  /** Adds the modules one at a time, the way `weaver module add` does. */
  const add = async (project: Project, ...modules: ModuleName[]) => {
    for (const name of modules) {
      const { files, context, enabled } = load(project);
      const result = enableModules(files, context, enabled, [name]);
      await files.commit();
      expect(result.warnings).toEqual([]);
    }
  };

  /** Removes the modules one at a time, the way `weaver module remove` does. */
  const remove = async (project: Project, ...modules: ModuleName[]) => {
    for (const name of modules) {
      const { files, context, enabled } = load(project);
      const result = disableModules(files, context, enabled, [name]);
      await files.commit();
      expect(result.warnings).toEqual([]);
    }
  };

  /** Reads every file of a project, parsing the JSON files so their key order does not matter. */
  const snapshot = (project: Project): Record<string, unknown> => {
    const files =
      typeof project === 'string' ? new ProjectFiles(project) : project;
    return Object.fromEntries(
      files.list('').map((file) => {
        const content = files.read(file)!;
        return [file, file.endsWith('.json') ? JSON.parse(content) : content];
      })
    );
  };

  /** The snapshot of a created project, shared by the tests comparing every combination of modules. */
  const createdSnapshot = async (
    modules: ModuleName[]
  ): Promise<Record<string, unknown>> => {
    const key = modules.join();
    if (!createdSnapshots.has(key)) {
      createdSnapshots.set(key, snapshot(await stage(modules)));
    }
    return createdSnapshots.get(key)!;
  };

  const read = (dir: string, file: string) =>
    fs.readFileSync(path.join(dir, file), 'utf8');

  /** Every combination of the modules that includes the modules each one requires. */
  const combinations = (): ModuleName[][] =>
    Array.from({ length: 2 ** moduleNames.length }, (_, mask) =>
      moduleNames.filter((_, i) => mask & (1 << i))
    ).filter(
      (names) =>
        (!names.includes('queue') || names.includes('redis')) &&
        (!names.includes('web') || names.includes('data'))
    );

  describe('enableModules', () => {
    test('adds every combination of modules like a created project', async () => {
      for (const modules of combinations()) {
        const added = await stage([]);
        // Added in the reverse order they are applied, to cover every integration
        await add(added, ...[...modules].reverse());

        expect([modules, snapshot(added)]).toEqual([
          modules,
          await createdSnapshot(modules)
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
        await add(added, 'data', 'scheduler', 'queue', 'web');

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

    test('keeps no placeholder beside the email templates', async () => {
      const dir = await create(['templates']);

      await add(dir, 'mailer');

      expect(fs.existsSync(path.join(dir, 'templates', '.gitkeep'))).toBe(
        false
      );
      expect(fs.existsSync(path.join(dir, 'templates', 'emails'))).toBe(true);
    });

    test('adds the email translations with the mailer only', async () => {
      const dir = await create(['locales']);
      expect(JSON.parse(read(dir, 'locales/en.json'))).toEqual({});

      await add(dir, 'mailer');

      expect(JSON.parse(read(dir, 'locales/en.json'))).toEqual(
        defaultTranslations
      );
    });

    test('keeps the existing translations, unless forced', async () => {
      const dir = await create(['locales']);
      fs.writeFileSync(
        path.join(dir, 'locales', 'en.json'),
        JSON.stringify({ emails: { greeting: 'Hi,' }, page: { title: 'Home' } })
      );

      await add(dir, 'mailer');

      const translations = JSON.parse(read(dir, 'locales/en.json'));
      expect(translations.emails.greeting).toBe('Hi,');
      expect(translations.emails.footer).toBe(
        'This email was sent by {appName}.'
      );
      expect(translations.page).toEqual({ title: 'Home' });

      await remove(dir, 'mailer');
      const { files, context, enabled } = loadProject(dir);
      enableModules(files, context, enabled, ['mailer'], { force: true });
      await files.commit();

      expect(JSON.parse(read(dir, 'locales/en.json'))).toEqual({
        ...defaultTranslations,
        page: { title: 'Home' }
      });
    });

    test('replaces the end-to-end test of the base project with the one of the server', async () => {
      const dir = await create(['data']);
      const base = read(dir, 'test/e2e/main.test.ts');
      expect(base).toContain('HealthService');

      await add(dir, 'web');
      expect(read(dir, 'test/e2e/main.test.ts')).toContain("url: '/api'");

      await remove(dir, 'web');
      expect(read(dir, 'test/e2e/main.test.ts')).toBe(base);
    });

    test('adds the database password of the server databases only', async () => {
      const dir = await create([]);
      await add(dir, 'data');
      expect(read(dir, '.env')).toContain('DB_PASSWORD=my-app\n');
      expect(read(dir, '.env.example')).toContain('DB_PASSWORD=my-app\n');
      expect(read(dir, '.gitignore')).not.toContain('/data/*.db');

      const sqlite = await create([], { database: 'sqlite' });
      await add(sqlite, 'data');
      expect(read(sqlite, '.env')).toBe('NODE_ENV=dev\n');
      expect(read(sqlite, '.gitignore')).toContain('/data/*.db\n');
      expect(fs.existsSync(path.join(sqlite, 'data', '.gitkeep'))).toBe(true);
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
        const removed = await stage([...moduleNames]);
        await remove(
          removed,
          ...[...moduleNames]
            .reverse()
            .filter((name) => !modules.includes(name))
        );

        expect([modules, snapshot(removed)]).toEqual([
          modules,
          await createdSnapshot(modules)
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

      expect(fs.readdirSync(path.join(dir, 'templates'))).toEqual([
        'page.html.hbs'
      ]);
    });

    test('deletes the unchanged email translations with the mailer, keeping the others', async () => {
      const dir = await create(['mailer', 'locales']);
      const translations = JSON.parse(read(dir, 'locales/en.json'));
      translations.emails.greeting = 'Hi,';
      translations.page = { title: 'Home' };
      fs.writeFileSync(
        path.join(dir, 'locales', 'en.json'),
        JSON.stringify(translations)
      );

      await remove(dir, 'mailer');

      expect(JSON.parse(read(dir, 'locales/en.json'))).toEqual({
        emails: { greeting: 'Hi,' },
        page: { title: 'Home' }
      });
    });

    test('restores the placeholder of the emptied template directory', async () => {
      const dir = await create(['mailer', 'templates']);

      await remove(dir, 'mailer');

      expect(fs.readdirSync(path.join(dir, 'templates'))).toEqual(['.gitkeep']);
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

    test('keeps the changed source files and seeders', async () => {
      const dir = await create(['data', 'web']);
      const model = path.join(dir, 'src', 'resources', 'user', 'model.ts');
      const seeder = path.join(
        dir,
        'database',
        'seeders',
        '001-create-roles-and-admin-user.ts'
      );
      fs.writeFileSync(model, 'export default {};\n');
      fs.appendFileSync(seeder, '// Changed\n');

      const { files, context, enabled } = loadProject(dir);
      const { warnings } = disableModules(files, context, enabled, ['web']);
      await files.commit();

      expect(warnings).toEqual([
        'Kept the changed file database/seeders/001-create-roles-and-admin-user.ts',
        'Kept the changed file src/resources/user/model.ts'
      ]);
      expect(fs.readFileSync(model, 'utf8')).toBe('export default {};\n');
      expect(fs.existsSync(seeder)).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'src', 'resources', 'user', 'service.ts'))
      ).toBe(false);
    });

    test('deletes the database directory and the generated types with the data module', async () => {
      const dir = await create(['data']);
      fs.writeFileSync(path.join(dir, 'src', 'types', 'generated.ts'), '');
      fs.writeFileSync(
        path.join(dir, 'database', 'seeders', '001-mine.ts'),
        ''
      );

      await remove(dir, 'data');

      for (const file of ['database', 'src/types', 'prisma.config.ts']) {
        expect(fs.existsSync(path.join(dir, file))).toBe(false);
      }
      expect(read(dir, 'test/e2e/main.test.ts')).toContain('HealthService');
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
