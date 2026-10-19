import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectFiles } from '../../scaffold/project-files';

describe('project-files', () => {
  let dir: string;
  let files: ProjectFiles;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-files-'));
    fs.mkdirSync(path.join(dir, 'templates', 'emails'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'templates', 'emails', 'a.hbs'), 'a');
    fs.writeFileSync(path.join(dir, 'templates', 'b.hbs'), 'b');
    fs.writeFileSync(path.join(dir, 'config.json'), '{"a":1}');
    files = new ProjectFiles(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('read', () => {
    test('reads the staged content before the file on disk', () => {
      expect(files.read('templates/b.hbs')).toBe('b');

      files.write('templates/b.hbs', 'changed');

      expect(files.read('templates/b.hbs')).toBe('changed');
      expect(
        fs.readFileSync(path.join(dir, 'templates', 'b.hbs'), 'utf8')
      ).toBe('b');
    });

    test('reads nothing of a removed file or directory', () => {
      files.remove('templates');

      expect(files.read('templates/b.hbs')).toBeUndefined();
      expect(files.exists('templates')).toBe(false);
      expect(files.read('missing.txt')).toBeUndefined();
    });
  });

  describe('readJson', () => {
    test('parses a JSON file', () => {
      expect(files.readJson('config.json')).toEqual({ a: 1 });

      files.writeJson('config.json', { b: 2 });

      expect(files.read('config.json')).toBe('{\n  "b": 2\n}\n');
    });
  });

  describe('list', () => {
    test('lists the files on disk and the staged ones', () => {
      files.write('templates/c.hbs', 'c');
      files.remove('templates/emails/a.hbs');

      expect(files.list('templates')).toEqual([
        'templates/b.hbs',
        'templates/c.hbs'
      ]);
    });

    test('lists a file written into a removed directory', () => {
      files.remove('templates');
      files.write('templates/c.hbs', 'c');

      expect(files.exists('templates')).toBe(true);
      expect(files.list('templates')).toEqual(['templates/c.hbs']);
    });
  });

  describe('changes', () => {
    test('lists the created, updated and deleted files', () => {
      files.write('new.txt', 'new');
      files.write('templates/b.hbs', 'changed');
      files.write('config.json', '{"a":1}');
      files.remove('templates/emails');

      expect(files.changes()).toEqual([
        { path: 'new.txt', type: 'create' },
        { path: 'templates/b.hbs', type: 'update' },
        { path: 'templates/emails', type: 'delete' }
      ]);
    });
  });

  describe('commit', () => {
    test('applies the changes, deleting the directories left empty', async () => {
      files.write('templates/c.hbs', 'c');
      files.remove('templates/emails/a.hbs');
      files.remove('config.json');

      await files.commit();

      expect(fs.readdirSync(path.join(dir, 'templates')).sort()).toEqual([
        'b.hbs',
        'c.hbs'
      ]);
      expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false);
      expect(files.changes()).toEqual([]);
    });

    test('replaces a removed directory with the files written into it', async () => {
      files.remove('templates');
      files.write('templates/c.hbs', 'c');

      await files.commit();

      expect(fs.readdirSync(path.join(dir, 'templates'))).toEqual(['c.hbs']);
    });
  });
});
