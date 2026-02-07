import { TSchema } from '@sinclair/typebox';

export type FieldType =
  | 'text'
  | 'int'
  | 'bigInt'
  | 'float'
  | 'boolean'
  | 'dateTime'
  | 'json'
  | 'blob'
  | 'enum';

export type IdType = 'text' | 'int' | 'bigInt';

export type IdGenerator =
  | 'autoincrement()'
  | 'uuid()'
  | 'uuid(7)'
  | 'cuid()'
  | 'cuid(2)';

export type FieldDefault =
  | string
  | number
  | boolean
  | any[]
  | 'uuid()'
  | 'cuid()'
  | 'now()'
  | 'autoincrement()';

export type FieldFormat =
  | 'date-time'
  | 'time'
  | 'date'
  | 'email'
  | 'hostname'
  | 'ipv4'
  | 'ipv6'
  | 'uri'
  | 'uuid'
  | 'regex';

export type InputType = 'all' | 'create' | 'update' | 'none';

export type OutputType = 'always' | 'single' | 'multiple' | 'none';

export type IdField = {
  type?: IdType;
  generator?: IdGenerator;
};

export type AuditFields = {
  updatedAt?: boolean;
  createdAt?: boolean;
  createdById?: boolean;
};

export type ScalarField = {
  type: FieldType;
  default?: FieldDefault;
  values?: string[];
  array?: boolean;
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: FieldFormat;
  pattern?: string;
};

export type RelationReferences = {
  model: string;
  array?: boolean;
  owner?: boolean;
};

export type RelationInput = {
  type: InputType;
  uniqueKey?: string;
  additionalProps?: Array<{
    name: string;
    required?: boolean;
  }>;
};

export type RelationOutput = {
  type: OutputType;
  count?: boolean;
};

export type RelationField = {
  references: RelationReferences;
  includes?: {
    [key: string]: Omit<RelationField, 'references'>;
  };
  input?: RelationInput;
  output?: RelationOutput;
  minItems?: number;
  required?: boolean;
  createIfNotExists?: boolean;
  orphanRemoval?: boolean;
};

export type FileField = {
  mimeType?: string | RegExp;
  namePattern?: string | ((file: any, resource: any) => string);
  array?: boolean;
  maxSize?: number | string;
  maxCount?: number;
  output?: RelationOutput;
};

export type OperationConfig = {
  omit?: string[];
  pick?: string[];
};

export type VirtualInput = {
  type?: InputType;
  value?: any | ((resource: any) => any);
};

export type VirtualOutput = {
  type?: OutputType;
  value?: any | ((resource: any) => any);
};

export type VirtualField = ScalarField & {
  input?: VirtualInput;
  output?: VirtualOutput;
};

export type ExportField = {
  headerName?: string;
  exclude?: boolean;
  mapValue?: string | ((value: any) => string);
};

export type ResourceModel = {
  name?: string;
  id?: IdField;
  audit?: AuditFields;
  scalars?: {
    [key: string]: ScalarField;
  };
  relations?: {
    [key: string]: RelationField;
  };
  files?: {
    [key: string]: FileField;
  };
  create?: OperationConfig;
  update?: OperationConfig;
  export?: {
    [key: string]: ExportField;
  };
  virtual?: {
    [key: string]: VirtualField;
  };
  index?: string[] | string[][];
};

export type ResourceModelSchema = {
  name: string;
  model: ResourceModel;
  readModel: TSchema;
  createModel: TSchema;
  updateModel: TSchema;
  virtualModel: TSchema;
  filesModel: TSchema;
  relationsModel: TSchema;
};
