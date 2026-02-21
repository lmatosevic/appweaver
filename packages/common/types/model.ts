export type FieldType =
  | 'string'
  | 'int'
  | 'bigInt'
  | 'float'
  | 'boolean'
  | 'dateTime'
  | 'json'
  | 'enum';

export type IdType = 'string' | 'int' | 'bigInt';

export type IdGenerator =
  | 'autoincrement()'
  | 'uuid()'
  | 'uuid(7)'
  | 'cuid()'
  | 'cuid(2)';

export type PrimitiveType = string | number | boolean | PrimitiveType[];

export type ObjectType = Record<string, any>;

export type FieldDefault =
  | PrimitiveType
  | ObjectType
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

export type ReferentialAction =
  | 'cascade'
  | 'restrict'
  | 'noAction'
  | 'setNull'
  | 'setDefault';

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
  hidden?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: FieldFormat;
  pattern?: string;
  examples?: PrimitiveType[];
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
  model: string;
  mappedBy?: string;
  array?: boolean;
  owner?: boolean;
  unique?: boolean;
  input?: RelationInput;
  output?: RelationOutput;
  minItems?: number;
  required?: boolean;
  createIfNotExists?: boolean;
  orphanRemoval?: boolean;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
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
  value?:
    | PrimitiveType
    | ObjectType
    | ((resource: any) => PrimitiveType | ObjectType);
};

export type VirtualOutput = {
  type?: OutputType;
  value?:
    | PrimitiveType
    | ObjectType
    | ((resource: any) => PrimitiveType | ObjectType);
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

export type ExportRelations = {
  [key: string]: ExportField;
};

export type ScalarConfig = Record<string, ScalarField>;

export type RelationConfig = Record<string, RelationField>;

export type FilesConfig = Record<string, FileField>;

export type VirtualConfig = Record<string, VirtualField>;

export type ExportConfig = Record<string, ExportField | ExportRelations>;

export type IndexConfig = string[] | string[][];

export type ResourceModelConfig = {
  name: string;
  id?: IdField;
  audit?: AuditFields;
  scalars?: ScalarConfig;
  relations?: RelationConfig;
  files?: FilesConfig;
  read?: OperationConfig;
  create?: OperationConfig;
  update?: OperationConfig;
  virtual?: VirtualConfig;
  export?: ExportConfig;
  index?: IndexConfig;
};
