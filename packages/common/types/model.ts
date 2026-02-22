export type FieldType =
  | 'string'
  | 'int'
  | 'bigInt'
  | 'float'
  | 'boolean'
  | 'dateTime'
  | 'json'
  | 'enum';

export type IdGeneratorString = 'uuid()' | 'uuid(7)' | 'cuid()' | 'cuid(2)';

export type IdGeneratorInt = 'autoincrement()';

export type PrimitiveType = string | number | boolean | PrimitiveType[];

export type ObjectType = Record<string, any>;

export type FieldDefaultString = string | IdGeneratorString;

export type FieldDefaultNumber = number | IdGeneratorInt;

export type FieldDefaultBoolean = boolean;

export type FieldDefaultDateTime = string | Date | 'now()';

export type FieldDefaultJson = ObjectType | PrimitiveType[];

export type FieldDefaultEnum = string;

export type FieldDefault =
  | FieldDefaultString
  | FieldDefaultNumber
  | FieldDefaultBoolean
  | FieldDefaultDateTime
  | FieldDefaultJson
  | FieldDefaultEnum;

export type FieldFormatString =
  | 'email'
  | 'hostname'
  | 'ipv4'
  | 'ipv6'
  | 'uri'
  | 'uuid'
  | 'regex';

export type FieldFormatDate = 'date-time' | 'time' | 'date';

export type InputType = 'all' | 'create' | 'update' | 'none';

export type OutputType = 'always' | 'single' | 'multiple' | 'none';

export type ReferentialAction =
  | 'cascade'
  | 'restrict'
  | 'noAction'
  | 'setNull'
  | 'setDefault';

export type IdFieldString = {
  type: Extract<FieldType, 'string'>;
  generator?: IdGeneratorString;
};

export type IdFieldInt = {
  type?: Extract<FieldType, 'int' | 'bigInt'>;
  generator?: IdGeneratorInt;
};

export type IdField = IdFieldString | IdFieldInt;

export type AuditFields = {
  updatedAt?: boolean;
  createdAt?: boolean;
  createdById?: boolean;
};

type BaseScalarField<T, IsArray extends boolean = boolean> = {
  array?: IsArray;
  default?: IsArray extends true ? T[] : T;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  examples?: PrimitiveType[];
};

export type ScalarFieldString = BaseScalarField<FieldDefaultString> & {
  type: Extract<FieldType, 'string'>;
  minLength?: number;
  maxLength?: number;
  format?: FieldFormatString;
  pattern?: string;
};

export type ScalarFieldNumber = BaseScalarField<FieldDefaultNumber> & {
  type: Extract<FieldType, 'int' | 'bigInt' | 'float'>;
  minimum?: number;
  maximum?: number;
};

export type ScalarFieldBoolean = BaseScalarField<FieldDefaultBoolean> & {
  type: Extract<FieldType, 'boolean'>;
};

export type ScalarFieldDateTime = BaseScalarField<FieldDefaultDateTime> & {
  type: Extract<FieldType, 'dateTime'>;
  format?: FieldFormatDate;
};

export type ScalarFieldJson = BaseScalarField<FieldDefaultJson> & {
  type: Extract<FieldType, 'json'>;
};

export type ScalarFieldEnum = BaseScalarField<FieldDefaultEnum> & {
  type: Extract<FieldType, 'enum'>;
  values: string[];
};

export type ScalarField =
  | ScalarFieldString
  | ScalarFieldNumber
  | ScalarFieldBoolean
  | ScalarFieldDateTime
  | ScalarFieldJson
  | ScalarFieldEnum;

export type RelationInput = {
  type: InputType;
  uniqueKey?: string;
  fullModel?: boolean;
};

export type RelationOutput = {
  type: OutputType;
  include?: { [key: string]: Omit<RelationOutput, 'count'> };
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
  output?: Omit<RelationOutput, 'include'>;
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

type Disallow<K extends PropertyKey> = {
  [P in K]?: never;
};

type FieldConfig<T> = {
  [key: string]: T;
} & Disallow<keyof AuditFields | 'id'>;

export type ScalarConfig = FieldConfig<ScalarField>;

export type RelationConfig = FieldConfig<RelationField>;

export type FilesConfig = FieldConfig<FileField>;

export type VirtualConfig = FieldConfig<VirtualField>;

export type ExportConfig = FieldConfig<ExportField | ExportRelations>;

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
