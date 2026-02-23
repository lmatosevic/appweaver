import { TObject } from '@sinclair/typebox';
import { ResourceModelConfig } from '@appweaver/common';
import { Prisma } from '../prisma/client/client';

export type Resource = {
  id: number;
  updatedAt?: Date;
  createdAt?: Date;
  createdById?: number;
};

export type ResourceData<T> = Omit<T, keyof Resource>;

export type ResourceClient = Record<Prisma.PrismaAction, any> & {
  name: string;
};

export type ResourceModel = {
  /** Model name in singular with the first capital letter (e.g., Model) */
  name: string;
  /** Received model config from default export */
  config: ResourceModelConfig;
  /** Full resource model with all configured fields (scalars, relations, files, and virtual) */
  readModel: TObject;
  /** Internal use only */
  createModel: TObject;
  /** Internal use only */
  updateModel: TObject;
  /** Internal use only */
  relationsModel: TObject;
  /** Internal use only */
  virtualModel: TObject;
  /** Response for files route */
  filesModel: TObject;
  /** Response for find, create, update, and delete routes */
  readOneModel: TObject;
  /** Response for query route */
  readManyModel: TObject;
  /** Request for create route */
  createOneModel: TObject;
  /** Request for update route */
  updateOneModel: TObject;
  /** Request for file upload route */
  fileUploadModel: TObject;
  /** Request for file delete route */
  fileDeleteModel: TObject;
};
