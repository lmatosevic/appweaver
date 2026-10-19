import fs from 'node:fs';
import path from 'node:path';
import type { Runtime } from './types';

/** The directory of the base project template and the module templates. */
export const templatesDir = path.join(__dirname, '..', 'templates');

/** A file of a template directory, with the project path it is written to. */
export type TemplateFile = {
  /** The project path, without the `.tpl` and runtime extensions. */
  path: string;
  source: string;
  /** Whether the variables of the file are replaced, set for the `.tpl` files. */
  render: boolean;
};

const runtimes: Runtime[] = ['node', 'bun'];

/**
 * Lists the files of a template directory for a runtime. A `.tpl` file has its variables replaced, and a `.node` or
 * `.bun` file is kept only for its runtime, replacing the file without the extension.
 *
 * @param {string} dir - The template directory.
 * @param {Runtime} runtime - The runtime of the project.
 * @return {TemplateFile[]} The files, sorted by their project path.
 */
export function collectTemplateFiles(
  dir: string,
  runtime: Runtime
): TemplateFile[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = new Map<string, TemplateFile & { variant: boolean }>();
  for (const entry of fs.readdirSync(dir, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!entry.isFile()) {
      continue;
    }

    const source = path.join(entry.parentPath, entry.name);
    let file = path.relative(dir, source).replace(/\\/g, '/');

    const render = file.endsWith('.tpl');
    file = file.replace(/\.tpl$/, '');

    const extension = path.extname(file).slice(1) as Runtime;
    const variant = runtimes.includes(extension);
    if (variant && extension !== runtime) {
      continue;
    }
    file = variant ? file.slice(0, -extension.length - 1) : file;

    if (!files.get(file)?.variant) {
      files.set(file, { path: file, source, render, variant });
    }
  }

  return [...files.values()]
    .map(({ path, source, render }) => ({ path, source, render }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Reads a template file, replacing the `{{NAME}}` variables of a `.tpl` file with their values.
 *
 * @param {TemplateFile} file - The template file.
 * @param {Record<string, string>} variables - The values of the variables, keyed by name.
 * @return {string | Buffer} The content of the file, a buffer for a file without variables.
 */
export function readTemplateFile(
  file: TemplateFile,
  variables: Record<string, string>
): string | Buffer {
  if (!file.render) {
    return fs.readFileSync(file.source);
  }

  let content = fs.readFileSync(file.source, 'utf8');
  // Inserted as they are, since a replacement string would read the '$$'
  // escapes of docker-compose as a pattern
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      () => value
    );
  }
  return content;
}
