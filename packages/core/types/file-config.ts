import { MultipartFile } from '@fastify/multipart';
import { File } from './generated';
import { Identity } from './generated';
import { Resource } from './resource';
import { OutputType } from './relation-config';

export type PatternNameFn<Model> = (
  file: MultipartFile,
  resource: Model
) => string;

export type FilePolicyFn<Model> = (
  user: Identity,
  resource: Model,
  file: File
) => boolean;

export type AccessType = 'protected' | 'private' | 'public';

export type FileConfig<Model = Resource> = {
  /**
   * **protected** - Accessible by any authenticated users. (default option)
   *
   * **private** - Accessible only by the authenticated file owner.
   *
   * **public** - Accessible by anyone without authentication.
   */
  accessType?: AccessType;
  outputType?: OutputType;
  outputCount?: boolean;
  optional?: boolean;
  mimeType?: string | RegExp;
  maxSize?: number | string;
  maxCount?: number;
  isArray?: boolean;
  namePattern?: string | PatternNameFn<Model>;
  canAccess?: FilePolicyFn<Model>;
  canCreate?: FilePolicyFn<Model>;
  canDelete?: FilePolicyFn<Model>;
};

export type FileConfigProps<Model = any, Files = any> = {
  [Key in keyof Files]: FileConfig<Model>;
};
