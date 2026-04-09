import { TObject } from '@sinclair/typebox';
import { MultipartFile } from './file';

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
  | FieldDefaultJson;

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
  /** Field type for string IDs */
  type: 'string';
  /** ID generation strategy */
  generator?: IdGeneratorString;
};

export type IdFieldInt = {
  /** Field type for integer IDs */
  type?: 'int' | 'bigInt';
  /** ID generation strategy */
  generator?: IdGeneratorInt;
};

export type IdField = IdFieldString | IdFieldInt;

export type AuditFields = {
  /** Auto-set timestamp on update */
  updatedAt?: boolean;
  /** Auto-set timestamp on creation */
  createdAt?: boolean;
  /** Stores the ID of the user who created the record */
  createdById?: boolean;
};

type BaseScalarField<T, IsArray extends boolean = boolean> = {
  /** Whether the field holds an array of values */
  array?: IsArray;
  /** Static default value */
  default?: IsArray extends true ? T[] : T;
  /** Default is computed/generated at the DB level */
  defaultGenerated?: boolean;
  /** Field must be provided on creation */
  required?: boolean;
  /** Value must be unique across records */
  unique?: boolean;
  /** Exclude field from API output */
  hidden?: boolean;
  /** Example values used in generated schema/docs */
  examples?: PrimitiveType[];
};

export type ScalarFieldString = BaseScalarField<FieldDefaultString> & {
  /** Field type */
  type: 'string';
  /** Minimum string length */
  minLength?: number;
  /** Maximum string length */
  maxLength?: number;
  /** Validation format */
  format?: FieldFormatString;
  /** Regex validation pattern */
  pattern?: string;
};

export type ScalarFieldNumber = BaseScalarField<FieldDefaultNumber> & {
  /** Field type */
  type: 'int' | 'bigInt' | 'float';
  /** Minimum allowed value */
  minimum?: number;
  /** Maximum allowed value */
  maximum?: number;
};

export type ScalarFieldBoolean = BaseScalarField<FieldDefaultBoolean> & {
  /** Field type */
  type: 'boolean';
};

export type ScalarFieldDateTime = BaseScalarField<FieldDefaultDateTime> & {
  /** Field type */
  type: 'dateTime';
  /** Date/time serialization format */
  format?: FieldFormatDate;
};

export type ScalarFieldJson = BaseScalarField<FieldDefaultJson> & {
  /** Field type */
  type: 'json';
};

export type ScalarFieldEnum = BaseScalarField<FieldDefaultEnum> & {
  /** Field type */
  type: 'enum';
  /** Allowed enum values */
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
  /** Which operations accept this relation as input */
  type: InputType;
  /** Field used to match existing related records */
  uniqueKey?: string;
  /** Accept the full related model as input instead of just the key */
  fullModel?: boolean;
};

export type RelationOutput = {
  /** Which operations include this relation in output */
  type: OutputType;
  /** Nested relations to include */
  include?: { [key: string]: Omit<RelationOutput, 'count'> };
  /** Include count of related records */
  count?: boolean;
};

export type RelationField = {
  /** Related resource model name */
  model: string;
  /** Foreign key field on the related model */
  mappedBy?: string;
  /** Whether this is a one-to-many relation */
  array?: boolean;
  /** Whether this side owns the foreign key */
  owner?: boolean;
  /** Enforce uniqueness on the relation */
  unique?: boolean;
  /** Input configuration for this relation */
  input?: RelationInput;
  /** Output configuration for this relation */
  output?: RelationOutput;
  /** Minimum number of related items required */
  minItems?: number;
  /** Relation must be provided on creation */
  required?: boolean;
  /** Create the related record if it doesn't exist */
  createIfNotExists?: boolean;
  /** Delete orphaned related records on update */
  orphanRemoval?: boolean;
  /** Referential action on delete */
  onDelete?: ReferentialAction;
  /** Referential action on update */
  onUpdate?: ReferentialAction;
};

export type FileField = {
  /** Allowed MIME type(s) or regex pattern */
  mimeType?: string | RegExp;
  /** Storage path pattern or factory function which accepts MultipartFile data
   * and related resource arguments */
  namePattern?:
    | string
    | (<T = any>(file: MultipartFile, resource: T) => string);
  /** Allow multiple file uploads */
  array?: boolean;
  /** Maximum file size (bytes or human-readable string) */
  maxSize?: number | string;
  /** Maximum number of files */
  maxCount?: number;
  /** Output configuration for the file relation */
  output?: Omit<RelationOutput, 'include'>;
};

export type OperationConfig = {
  /** Fields to exclude from the operation */
  omit?: string[];
  /** Fields to include exclusively */
  pick?: string[];
};

export type VirtualInput = {
  /** Which operations accept this virtual field */
  type?: InputType;
  /** Static value or factory function */
  value?:
    | PrimitiveType
    | ObjectType
    | (<T = any>(resource: T) => PrimitiveType | ObjectType);
};

export type VirtualOutput = {
  /** Which operations expose this virtual field */
  type?: OutputType;
  /** Static value or factory function */
  value?:
    | PrimitiveType
    | ObjectType
    | (<T = any>(resource: T) => PrimitiveType | ObjectType);
};

export type VirtualField = ScalarField & {
  /** Input behavior for this virtual field */
  input?: VirtualInput;
  /** Output behavior for this virtual field */
  output?: VirtualOutput;
};

export type ExportField = {
  /** Column header in the exported file */
  headerName?: string;
  /** Exclude this field from exports */
  exclude?: boolean;
  /** Transform the value for export output */
  mapValue?: string | (<T = any>(value: T) => string);
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

export type Model = {
  /** Custom model name */
  name: string;
  /** custom model schema */
  schema: TObject;
};

export type ResourceModelConfig = {
  /** Resource model name used for code generation, routing, and security policy
   * rules. Should be in PascalCase (e.g., MyModel) */
  name: string;
  /** Override the database table name */
  tableName?: string;
  /** Emit generated TypeScript types for this model */
  generateTypes?: boolean;
  /** Emit generated Prisma schema for this model */
  generateSchema?: boolean;
  /** Primary key configuration */
  id?: IdField;
  /** Audit timestamp/author fields to enable */
  audit?: AuditFields;
  /** Scalar field definitions */
  scalars?: ScalarConfig;
  /** Relation field definitions */
  relations?: RelationConfig;
  /** File field definitions */
  files?: FilesConfig;
  /** Field restrictions for read operations */
  read?: OperationConfig;
  /** Field restrictions for create operations */
  create?: OperationConfig;
  /** Field restrictions for update operations */
  update?: OperationConfig;
  /** Virtual (computed) field definitions */
  virtual?: VirtualConfig;
  /** Export field definitions */
  export?: ExportConfig;
  /** Database index definitions */
  index?: IndexConfig;
};
