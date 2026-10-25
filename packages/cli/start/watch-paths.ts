import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'node:fs/promises';

/**
 * Watches directories recursively, calling the callback once for every burst of file changes. A directory that does not
 * exist is skipped. An event leaving the modification time and size of its file unchanged is ignored, since Windows
 * reports reading a file as a change when it updates its last access time.
 *
 * @param {string[]} paths - The directories to watch.
 * @param {(fileName: string) => void} onChange - Called with the last changed file once the changes settle.
 * @param {number} [delay=100] - The milliseconds to wait for further changes before calling the callback.
 * @return {AbortController} The controller that stops watching when aborted.
 */
export function watchPaths(
  paths: string[],
  onChange: (fileName: string) => void,
  delay: number = 100
): AbortController {
  const controller = new AbortController();
  const fingerprints = new Map<string, string | undefined>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  for (const dir of new Set(paths.map((p) => path.resolve(p)))) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const entry of fs.readdirSync(dir, {
      recursive: true,
      encoding: 'utf8'
    })) {
      const file = path.join(dir, entry);
      fingerprints.set(file, fingerprint(file));
    }

    void (async () => {
      try {
        const changes = watch(dir, {
          recursive: true,
          signal: controller.signal
        });
        for await (const { filename } of changes) {
          if (filename === null) {
            continue;
          }
          const file = path.join(dir, filename);
          const current = fingerprint(file);
          if (fingerprints.has(file) && fingerprints.get(file) === current) {
            continue;
          }
          fingerprints.set(file, current);
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => onChange(file), delay);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error(e);
        }
      }
    })();
  }

  controller.signal.addEventListener('abort', () =>
    clearTimeout(debounceTimer)
  );

  return controller;
}

/** The modification time and size of a file, `undefined` when it does not exist. */
function fingerprint(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return undefined;
  }
}
