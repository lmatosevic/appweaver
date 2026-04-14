import { TObject } from '@sinclair/typebox';
import { ResourceModelConfig } from './model';
import { ResourceRoutesConfig } from './routes';

export type Resource = {
  id: number;
  updatedAt?: Date;
  createdAt?: Date;
  createdById?: number;
};

export type ResourceData<T> = Omit<T, keyof Resource>;

export type ClientOperation =
  | 'findFirst'
  | 'findFirstOrThrow'
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'findMany'
  | 'create'
  | 'createMany'
  | 'createManyAndReturn'
  | 'update'
  | 'updateMany'
  | 'updateManyAndReturn'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'aggregate'
  | 'count'
  | 'groupBy'
  | '$queryRaw'
  | '$executeRaw'
  | '$queryRawUnsafe'
  | '$executeRawUnsafe'
  | 'findRaw'
  | 'aggregateRaw'
  | '$runCommandRaw';

export type ResourceClient = Record<ClientOperation, any> & {
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
  /** Response for file routes */
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

export type ResourceRoutes = {
  /** Configuration for route definitions and behavior */
  config: ResourceRoutesConfig;
  /** Function to register routes with the server instance */
  handler: (server: any) => void;
};
