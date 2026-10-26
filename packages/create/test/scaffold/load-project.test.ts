import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject } from '../../scaffold/create-project';
import { loadProject } from '../../scaffold/load-project';

describe('load-project', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-load-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('loadProject', () => {
    test('loads the properties and the enabled modules of a project', async () => {
      await createProject({
        dir,
        name: 'MyApp',
        packageName: 'my-app',
        description: 'My description',
        host: '0.0.0.0',
        port: 8080,
        database: 'mysql',
        runtime: 'bun',
        modules: ['data', 'web', 'redis', 'queue', 'locales', 'docker']
      });

      const { context, enabled } = loadProject(dir);

      expect(context).toEqual({
        name: 'my-app',
        host: '0.0.0.0',
        port: 8080,
        runtime: 'bun',
        database: 'mysql'
      });
      expect(enabled).toEqual([
        'data',
        'web',
        'redis',
        'queue',
        'locales',
        'docker'
      ]);
    });

    test('defaults the server and the database of a project without them', async () => {
      await createProject({
        dir,
        name: 'MyApp',
        packageName: 'my-app',
        description: 'My description',
        host: '127.0.0.1',
        port: 8080,
        database: 'mysql',
        runtime: 'node',
        modules: []
      });

      const { context, enabled } = loadProject(dir);

      expect(context).toEqual({
        name: 'my-app',
        port: 5000,
        runtime: 'node',
        database: 'sqlite'
      });
      expect(enabled).toEqual([]);
    });

    test('binds the server to every interface without a host', async () => {
      await createProject({
        dir,
        name: 'MyApp',
        packageName: 'my-app',
        description: 'My description',
        port: 5000,
        database: 'sqlite',
        runtime: 'node',
        modules: ['data', 'web']
      });

      const appConfig = JSON.parse(
        fs.readFileSync(path.join(dir, 'appweaver.json'), 'utf8')
      );
      expect(appConfig.config.server).toEqual({ host: '0.0.0.0', port: 5000 });
      expect(loadProject(dir).context.host).toBe('0.0.0.0');
    });

    test('rejects a directory without a project', () => {
      expect(() => loadProject(dir)).toThrow(
        `No package.json file found in ${dir}`
      );

      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      expect(() => loadProject(dir)).toThrow(
        `No appweaver.json file found in ${dir}`
      );
    });
  });
});
