import path from 'node:path';

export function relativePathFrom(firstPath: string, otherPath: string): string {
  const schemaDir = path.dirname(path.resolve(firstPath));
  const clientAbs = path.resolve(otherPath);

  let rel = path.relative(schemaDir, clientAbs);

  if (!rel.startsWith('.') && rel !== '') {
    rel = `.${path.sep}${rel}`;
  } else if (rel === '') {
    rel = '.';
  }

  return rel.replace(/\\/g, '/');
}
