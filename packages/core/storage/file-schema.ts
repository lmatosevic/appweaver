import { Type } from '@sinclair/typebox';
import { RouteSchema } from '@appweaver/common';
import { AllErrorResponses } from '../errors';

export const FileName = Type.Object({
  '*': Type.String()
});

export const FileRangeHeader = Type.Object({
  Range: Type.Optional(Type.String({ examples: ['bytes=0-1023'] }))
});

export const FileResponse = Type.String({ format: 'binary' });

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
      ...AllErrorResponses
    },
    params: FileName,
    headers: FileRangeHeader
  };
}
