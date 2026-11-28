import { TObject, TSchema } from '@sinclair/typebox';
import {
  CONFIG,
  RESOURCE_AUTH,
  RESOURCE_MODEL_EXTEND,
  RESOURCE_MODEL_RELINK,
  RESOURCE_NAME,
  RESOURCE_SOURCE,
  RESOURCE_TYPE
} from '../constants';
import { ResourceModelConfig } from './model';
import { ResourceRoutesConfig } from './routes';
import { ResourceId } from './resource-id';

export type Resource = {
  id: ResourceId;
  updatedAt?: Date;
  createdAt?: Date;
  createdById?: ResourceId | null;
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

/** The marks the resource factories set on what they create, read by the loaders and the dependency injection. */
export type ResourceMarks = {
  /** The name of the model of the resource */
  [RESOURCE_NAME]?: string;
  /** The kind of the resource (`Model`, `Service`, `Routes` or `Policy`) */
  [RESOURCE_TYPE]?: string;
  /** The config the resource was created with */
  [CONFIG]?: unknown;
  /** The file the resource was created in */
  [RESOURCE_SOURCE]?: string;
  /** Set on the model and the service of the auth model */
  [RESOURCE_AUTH]?: boolean;
};

export type ResourceModel = ResourceMarks & {
  /** Model name in singular with the first capital letter (e.g., Model) */
  name: string;
  /** Received model config from default export */
  config: ResourceModelConfig;
  /** Primary key schema (`{ id }`), used for the route path parameter and for
   * the relation inputs pointing at this model */
  idModel: TObject;
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
  /** Union of the single read model and null, referenced wherever a nullable
   * relation points at this model */
  readOneNullableModel: TSchema;
  /** Request for create route */
  createOneModel: TObject;
  /** Request for update (PATCH) route */
  updateOneModel: TObject;
  /** Request for replace (PUT) route */
  replaceOneModel: TObject;
  /** Request data for creating this model through another model's relation input */
  relationCreateModel: TObject;
  /** Request data for updating this model through another model's relation input */
  relationUpdateModel: TObject;
  /** Request for file upload route */
  fileUploadModel: TObject;
  /** Request for file delete route */
  fileDeleteModel: TObject;
  /** Request for file version delete route */
  fileVersionDeleteModel: TObject;
  /** The values of the time series fields, each optional and nullable */
  seriesModel: TObject;
  /** Builds the schemas again once every model is registered, see `relinkResourceModels` */
  [RESOURCE_MODEL_RELINK]?: () => void;
  /** Merges an extension of `extendModel` into the config of the model and builds it again */
  [RESOURCE_MODEL_EXTEND]?: (
    merge: (config: ResourceModelConfig) => ResourceModelConfig
  ) => void;
};

export type ResourceRoutes = ResourceMarks & {
  /** Configuration for route definitions and behavior */
  config: ResourceRoutesConfig;
  /** A base path for all registered routes of this resource.
   * Default is the plural snake-case of the model name if not configured differently. */
  basePath: string;
  /** Function to register routes with the server instance */
  handler: (server: any) => void;
};
