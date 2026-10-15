import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'node:fs/promises';

/**
 * Watches directories recursively, calling the callback once for every burst of file changes. A directory that does not
 * exist is skipped.
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
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  for (const dir of new Set(paths.map((p) => path.resolve(p)))) {
    if (!fs.existsSync(dir)) {
      continue;
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
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(
            () => onChange(path.join(dir, filename)),
            delay
          );
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
