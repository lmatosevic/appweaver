import { Type } from '@sinclair/typebox';
import { ErrorCode, RouteSchema } from '@appweaver/common';
import { errorResponses } from '../errors/error-schema';

export const FileName = Type.Object({
  '*': Type.String()
});

export const FileRangeHeader = Type.Object({
  Range: Type.Optional(Type.String({ example: 'bytes=0-1023' }))
});

export const FileResponse = Type.String({ format: 'binary' });

/**
 * Builds the route schema of the public or protected file access route, responding with the full or a partial
 * binary content of a file.
 *
 * @param {boolean} isPublic - Whether the route serves public files, without authentication.
 * @return {RouteSchema} The route schema.
 */
export function createFileAccessSchema(isPublic: boolean): RouteSchema {
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
        ErrorCode.FileStorageError
      )
    },
    params: FileName,
    headers: FileRangeHeader
  };
}
