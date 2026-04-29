import fsp from 'node:fs/promises';
import yaml from 'js-yaml';
import { OpenAPI3 } from 'openapi-typescript';

export async function readSchemaContent(schemaPath: string): Promise<string> {
  let schemaUrl: URL | undefined;

  try {
    schemaUrl = new URL(schemaPath);
  } catch {
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
