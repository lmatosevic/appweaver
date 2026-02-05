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

export type IdType = 'text' | 'number';

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

export type RelationType = 'oneToOne' | 'oneToMany' | 'manyToMany';

export type InputType = 'all' | 'create' | 'update' | 'none';

export type OutputType = 'always' | 'single' | 'multiple' | 'none';

export type IdField = {
  type?: IdType;
  generator?: IdGenerator;
};

export type AuditField = {
  updatedAt?: boolean;
  createdAt?: boolean;
  createdBy?: boolean;
};

export type Field = {
  type: FieldType;
  default?: FieldDefault;
  values?: string[];
  array?: boolean;
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  format?: FieldFormat;
  pattern?: string | RegExp;
};

export type RelationReferences = {
  model: string;
  type: RelationType;
};

export type RelationInput = {
  type: InputType;
  uniqueKey?: string;
  additionalProps?: Array<{
    name: string;
    optional?: boolean;
  }>;
};

export type RelationOutput = {
  type: OutputType;
  count?: boolean;
};

export type Relation = {
  references: RelationReferences;
  includes?: {
    [key: string]: Omit<Relation, 'references'>;
  };
  input?: RelationInput;
  output?: RelationOutput;
  minItems?: number;
  optional?: boolean;
  createIfNotExists?: boolean;
  orphanRemoval?: boolean;
};

export type FileField = {
  mimeType?: string | RegExp;
  namePattern?: string | ((file: any, resource: any) => string);
  optional?: boolean;
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

export type VirtualField = {
  type: FieldType;
  array?: boolean;
  optional?: boolean;
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
  audit?: AuditField;
  fields?: {
    [key: string]: Field;
  };
  relations?: {
    [key: string]: Relation;
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
  index?: string[];
};
