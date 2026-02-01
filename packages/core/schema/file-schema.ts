import { TObject, Type } from '@sinclair/typebox';
import { CommonData, CommonId } from './common-schema';
import { AllErrorResponses } from './error-schema';
import { Nullable } from '../utils';
import { FileConfigProps } from '../types';

export const File = Type.Composite([
  CommonId,
  Type.Object({
    name: Type.String({ examples: ['image_123.png'] }),
    originalName: Type.String({ examples: ['image.png'] }),
    mimeType: Type.String({ examples: ['image/png'] }),
    sizeBytes: Type.Integer({ minimum: 0, examples: [1024] }),
    title: Nullable(Type.String()),
    description: Nullable(Type.String())
  }),
  CommonData
]);

export const FileName = Type.Object({
  '*': Type.String()
});

export const FileRangeHeader = Type.Object({
  Range: Type.Optional(Type.String({ examples: ['bytes=0-1023'] }))
});

export const FileResponse = Type.String({ format: 'binary' });

export const FileUpload = Type.Unsafe({ isFile: true });

export const FileArrayUpload = Type.Array(FileUpload);

export const FileDelete = Type.String({ examples: ['image_123.png'] });

export const FileArrayDelete = Type.Array(FileDelete);

export function createFileAccessSchema(isPublic: boolean): Record<string, any> {
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

export function fileInputModels(fileConfig: FileConfigProps): {
  fileUploadModel: TObject;
  fileDeleteModel: TObject;
} {
  const fileUploadModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.isArray ? FileArrayUpload : FileUpload)
      ])
    )
  );

  const fileDeleteModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.isArray ? FileArrayDelete : FileDelete)
      ])
    )
  );

  return { fileUploadModel, fileDeleteModel };
}
