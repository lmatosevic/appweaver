import fs from 'node:fs';
import path from 'node:path';

const CREATE_LOGGER = /createLogger\(\s*['"`]([\w-]+)['"`]\s*\)/g;

/** The directories holding no source of the module. */
const skipped = new Set(['node_modules', 'dist', 'test']);

/**
 * Returns the names of the loggers the TypeScript sources of a directory create with `createLogger('name')`, so a
 * test checks the `loggerNames` of the module manifest against them.
 *
 * @example
 * expect([...manifest.loggerNames!].sort()).toEqual(sourceLoggerNames(path.join(__dirname, '../src')));
 *
 * @param {string} directory - The source directory, searched with its subdirectories except `test`, `dist` and
 * `node_modules`.
 * @return {string[]} The logger names, sorted and without duplicates.
 */
export function sourceLoggerNames(directory: string): string[] {
  const names = new Set<string>();
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name)) {
          visit(entryPath);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        for (const [, name] of fs
          .readFileSync(entryPath, 'utf8')
          .matchAll(CREATE_LOGGER)) {
          names.add(name);
        }
      }
    }
  };
  visit(directory);
  return [...names].sort();
}
