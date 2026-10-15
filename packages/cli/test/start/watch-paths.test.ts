import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchPaths } from '../../start/watch-paths';

describe('watch-paths', () => {
  let dir: string;
  let controller: AbortController | undefined;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-watch-'));
    fs.mkdirSync(path.join(dir, 'templates', 'emails'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'locales'));
  });

  afterEach(() => {
    controller?.abort();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('watchPaths', () => {
    test('calls the callback once for a burst of changes', async () => {
      const onChange = jest.fn();
      controller = watchPaths(
        [path.join(dir, 'templates'), path.join(dir, 'locales')],
        onChange,
        50
      );
      await wait(50);

      fs.writeFileSync(path.join(dir, 'locales', 'en.json'), '{}');
      fs.writeFileSync(
        path.join(dir, 'templates', 'emails', 'welcome.html.hbs'),
        'Hi'
      );
      await wait(300);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        path.join(dir, 'templates', 'emails', 'welcome.html.hbs')
      );
    });

    test('skips a directory that does not exist', async () => {
      const onChange = jest.fn();
      controller = watchPaths(
        [path.join(dir, 'missing'), path.join(dir, 'locales')],
        onChange,
        50
      );
      await wait(50);

      fs.writeFileSync(path.join(dir, 'locales', 'de.json'), '{}');
      await wait(300);

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    test('stops watching once aborted', async () => {
      const onChange = jest.fn();
      controller = watchPaths([path.join(dir, 'locales')], onChange, 50);
      await wait(50);

      controller.abort();
      fs.writeFileSync(path.join(dir, 'locales', 'hr.json'), '{}');
      await wait(300);

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
