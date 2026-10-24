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
        modules: ['redis', 'queue', 'locales', 'docker']
      });

      const { context, enabled } = loadProject(dir);

      expect(context).toEqual({
        name: 'my-app',
        port: 8080,
        runtime: 'bun',
        database: 'mysql'
      });
      expect(enabled).toEqual(['redis', 'queue', 'locales', 'docker']);
    });

    test('rejects a directory without a project', () => {
      expect(() => loadProject(dir)).toThrow(
        `No package.json file found in ${dir}`
      );

      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      expect(() => loadProject(dir)).toThrow(
        `No appweaver.json file found in ${dir}`
      );

      fs.writeFileSync(path.join(dir, 'appweaver.json'), '{}');
      expect(() => loadProject(dir)).toThrow(
        'Unable to resolve the database of the project'
      );
    });
  });
});
