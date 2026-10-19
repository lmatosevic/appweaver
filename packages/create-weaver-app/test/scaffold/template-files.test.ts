import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectTemplateFiles,
  readTemplateFile
} from '../../scaffold/template-files';

describe('template-files', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-templates-'));
    fs.mkdirSync(path.join(dir, 'test'));
    for (const file of [
      'Dockerfile',
      'Dockerfile.bun',
      'package.json.tpl',
      'package.json.bun.tpl',
      'jest.config.json.node',
      'test/preload.ts.bun'
    ]) {
      fs.writeFileSync(path.join(dir, file), `{{NAME}} ${file}`);
    }
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('collectTemplateFiles', () => {
    test('keeps the files of the Node runtime', () => {
      expect(
        collectTemplateFiles(dir, 'node').map(({ path, source, render }) => [
          path,
          source.slice(dir.length + 1),
          render
        ])
      ).toEqual([
        ['Dockerfile', 'Dockerfile', false],
        ['jest.config.json', 'jest.config.json.node', false],
        ['package.json', 'package.json.tpl', true]
      ]);
    });

    test('replaces the files with the Bun variants', () => {
      expect(
        collectTemplateFiles(dir, 'bun').map(({ path, source }) => [
          path,
          source.slice(dir.length + 1)
        ])
      ).toEqual([
        ['Dockerfile', 'Dockerfile.bun'],
        ['package.json', 'package.json.bun.tpl'],
        ['test/preload.ts', path.join('test', 'preload.ts.bun')]
      ]);
    });

    test('lists nothing of a missing directory', () => {
      expect(collectTemplateFiles(path.join(dir, 'missing'), 'node')).toEqual(
        []
      );
    });
  });

  describe('readTemplateFile', () => {
    test('replaces the variables of a template only', () => {
      const [dockerfile, , pkg] = collectTemplateFiles(dir, 'node');
      const variables = { NAME: '$$App' };

      expect(readTemplateFile(pkg, variables)).toBe('$$App package.json.tpl');
      expect(readTemplateFile(dockerfile, variables).toString()).toBe(
        '{{NAME}} Dockerfile'
      );
    });
  });
});
