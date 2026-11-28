import fs from 'node:fs';
import path from 'node:path';

/** The tools `@appweaver/tooling` carries, run by `weaver lint`, `weaver format` and `weaver test`. */
export type Tool = 'eslint' | 'prettier' | 'jest';

/** The executable of each tool, by its `bin` name. */
const TOOL_BINS: Record<Tool, string> = {
  eslint: 'eslint',
  prettier: 'prettier',
  jest: 'jest'
};

/**
 * Resolves the script of a tool, from the dependencies of this package, so a project runs the versions its
 * `@appweaver/tooling` was released with, wherever the package manager placed them.
 *
 * @param {Tool} tool - The tool.
 * @return {string} The absolute path of its executable script, run with `node`.
 */
export function toolBin(tool: Tool): string {
  const manifestPath = require.resolve(`${tool}/package.json`, {
    paths: [__dirname]
  });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const bin =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : manifest.bin?.[TOOL_BINS[tool]];
  if (!bin) {
    throw new Error(
      `The ${tool} package declares no ${TOOL_BINS[tool]} executable`
    );
  }
  return path.join(path.dirname(manifestPath), bin);
}
