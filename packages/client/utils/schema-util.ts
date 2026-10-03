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

/**
 * Reads the content of a schema, fetching it over HTTP(S) when the location is
 * a web URL and reading it from the filesystem otherwise.
 *
 * @param {string} schemaPath The schema location, either a filesystem path or
 * an `http:`, `https:` or `file:` URL.
 * @returns {Promise<string>} The raw schema content, in JSON or YAML format.
 * @throws {Error} When the schema URL cannot be reached or responds with an
 * error status.
 */
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

/**
 * Rewrites the null schemas of an OpenAPI 3.0 document back into `{ type: 'null' }`. OpenAPI
 * 3.0 has no null type, so a document declares it as a nullable object only `null` satisfies,
 * which the generated types would spell out as `never | null` and the well known shapes holding
 * it would no longer match, leaving them inline.
 *
 * The given schema is mutated in place.
 *
 * @param {OpenAPI3} schema The OpenAPI v3 schema to rewrite the null schemas of.
 */
export function normalizeNullTypes(schema: OpenAPI3): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const record = node as Record<string, unknown>;
    if (
      record['nullable'] === true &&
      (record['type'] === undefined || record['type'] === 'object') &&
      Array.isArray(record['enum']) &&
      record['enum'].length === 1 &&
      record['enum'][0] === null
    ) {
      delete record['nullable'];
      delete record['enum'];
      record['type'] = 'null';
      return;
    }

    Object.values(record).forEach(visit);
  };

  visit(schema);
}

/**
 * Parses the content of a schema into an OpenAPI document, trying JSON first
 * and falling back to YAML.
 *
 * @param {string} schemaContent The raw schema content, in JSON or YAML format.
 * @returns {Promise<OpenAPI3>} The parsed OpenAPI document.
 * @throws {Error} When the content is neither valid JSON nor valid YAML.
 */
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
