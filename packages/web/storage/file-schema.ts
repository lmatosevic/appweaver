import { Type } from '@sinclair/typebox';
import { ErrorCode, RouteSchema } from '@appweaver/common';
import { fileVersionsConfig } from '@appweaver/data';
import { errorResponses } from '../errors';

export const FileName = Type.Object({
  '*': Type.String()
});

export const FileRangeHeader = Type.Object({
  Range: Type.Optional(Type.String({ example: 'bytes=0-1023' }))
});

export const FileResponse = Type.String({ format: 'binary' });

export const FileVersionQuery = Type.Object({
  version: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: 'The version of the file, the current one by default'
    })
  )
});

/**
 * Builds the route schema of the public or protected file access route, responding with the full or a partial
 * binary content of a file. With `storage.versions.enabled`, the `version` query parameter selects a previous version.
 *
 * @param {boolean} isPublic - Whether the route serves public files, without authentication.
 * @return {RouteSchema} The route schema.
 */
export function createFileAccessSchema(isPublic: boolean): RouteSchema {
  const versions = fileVersionsConfig.ENABLED;

  return {
    tags: ['Files'],
    security: isPublic ? [] : [{ bearer: [] }],
    summary: `Fetch ${isPublic ? 'public' : 'protected'} files`,
    description: `Fetch ${isPublic ? 'public' : 'protected'} files`,
    response: {
      200: {
        description: 'Binary file content',
        content: {
          'application/octet-stream': {
            schema: FileResponse
          }
        }
      },
      206: {
        description: 'Binary partial file content',
        content: {
          'application/octet-stream': {
            schema: FileResponse
          }
        }
      },
      ...errorResponses(
        ErrorCode.AuthInvalidToken,
        ErrorCode.AuthTokenExpired,
        ErrorCode.FileNotFound,
        ErrorCode.FileForbidden,
        ...(versions
          ? [ErrorCode.FileVersioningDisabled, ErrorCode.FileVersionNotFound]
          : []),
        ErrorCode.FileStorageError
      )
    },
    params: FileName,
    headers: FileRangeHeader,
    ...(versions ? { querystring: FileVersionQuery } : {})
  };
}
