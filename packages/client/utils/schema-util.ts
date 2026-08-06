import fsp from 'node:fs/promises';
import yaml from 'js-yaml';
import { OpenAPI3 } from 'openapi-typescript';

// A Windows path starting with a drive letter (i.e. `C:\schema.json`) parses
// as a URL whose protocol is a single letter, no real protocol is one letter.
const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/;

/**
 * Parses a schema location into a URL, treating the locations that are
 * filesystem paths as such rather than as URLs.
 *
 * @param {string} schemaPath The schema location given on the command line,
 * either a URL or a filesystem path.
 * @returns {URL | undefined} The parsed URL, or undefined when the location is
 * a filesystem path, including a Windows path starting with a drive letter.
 */
export function parseSchemaUrl(schemaPath: string): URL | undefined {
  if (WINDOWS_DRIVE_PATH.test(schemaPath)) {
    return undefined;
  }

  try {
    return new URL(schemaPath);
  } catch {
    // Schema path is not in URL format
    return undefined;
  }
}

export async function readSchemaContent(schemaPath: string): Promise<string> {
  const schemaUrl = parseSchemaUrl(schemaPath);

  if (!schemaUrl) {
    return await fsp.readFile(schemaPath, 'utf8');
  }

  if (schemaUrl.protocol === 'http:' || schemaUrl.protocol === 'https:') {
    let res: Response;
    try {
      res = await fetch(schemaUrl.toString());
    } catch {
      throw new Error(`Cannot access schema URL: ${schemaUrl}`);
    }
    if (!res.ok) {
      throw new Error(`Fetching schema ${schemaUrl} failed: ${res.statusText}`);
    }
    return await res.text();
  }

  return await fsp.readFile(schemaUrl, 'utf8');
}

export async function toSchemaObject(schemaContent: string): Promise<OpenAPI3> {
  try {
    return JSON.parse(schemaContent);
  } catch {
    // not JSON, try YAML
  }

  try {
    return yaml.load(schemaContent) as OpenAPI3;
  } catch {
    throw Error('Unable to parse schema object in JSON or YAML format.');
  }
}
