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

export type GeneratorString =
  | 'uuid()'
  | 'uuid(7)'
  | 'cuid()'
  | 'cuid(2)'
  | 'nanoid()';

export type GeneratorInt = 'autoincrement()';

export type GeneratorDateTime = 'now()';

export type PrimitiveType = string | number | boolean | PrimitiveType[];

export type ObjectType = Record<string, any>;

export type FieldDefaultString = string;

export type FieldDefaultNumber = number;

export type FieldDefaultBoolean = boolean;

export type FieldDefaultDateTime = string | Date;

export type FieldDefaultJson = ObjectType | PrimitiveType[];

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
  /** Field type for string IDs, inferred when only a string generator is given */
  type?: 'string';
  /** ID generation strategy (default: `uuid()`) */
  generator?: GeneratorString;
};

export type IdFieldInt = {
  /** Field type for integer IDs (default) */
  type?: 'int' | 'bigInt';
  /** ID generation strategy (default: `autoincrement()`) */
  generator?: GeneratorInt;
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

type BaseScalarField<T, G = never, IsArray extends boolean = boolean> = {
  /** Whether the field holds an array of values */
  array?: IsArray;
  /** Static default value */
  default?: IsArray extends true ? T[] : T;
  /** Default is computed by the provided generator function */
  defaultGenerator?: G;
  /** Default is computed/generated at the DB level using the expression in
   * supported database syntax. (e.g., (concat('token_', gen_random_uuid()))::TEXT) */
  defaultExpression?: string;
  /** Field must be provided on creation */
  required?: boolean;
  /** Value must be unique across records */
  unique?: boolean;
  /** Exclude field from API output */
  hidden?: boolean;
  /** Example value used in the generated OpenAPI (Swagger) schema documentation */
  example?: PrimitiveType;
};

export type ScalarFieldString = BaseScalarField<
  FieldDefaultString,
  GeneratorString
> & {
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

export type ScalarFieldNumber = BaseScalarField<
  FieldDefaultNumber,
  GeneratorInt
> & {
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

export type ScalarFieldDateTime = BaseScalarField<
  FieldDefaultDateTime,
  GeneratorDateTime
> & {
  /** Field type */
  type: 'dateTime';
  /** Date/time serialization format */
  format?: FieldFormatDate;
};

export type ScalarFieldJson = BaseScalarField<FieldDefaultJson> & {
  /** Field type */
  type: 'json';
};

export type ScalarFieldEnum = BaseScalarField<FieldDefaultString> & {
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
  /** Unique field used to match existing related records, so an inline create
   * becomes a connect-or-create. Requires `allowCreate`. Plain connect and
   * inline update actions always match related records by `id`. */
  uniqueKey?: string;
  /** Allow creating related records inline: the input additionally accepts the
   * related model's create data (objects without an `id`). */
  allowCreate?: boolean;
  /** Allow updating related records inline on parent update requests: the input
   * additionally accepts the related model's update data with a required `id`.
   * On parent create requests, objects carrying an `id` are connected instead,
   * since the database can only update relations within an update action. */
  allowUpdate?: boolean;
};

export type RelationOutput = {
  /** Which operations include this relation in output */
  type: OutputType;
  /** Nested relations to include */
  include?: { [key: string]: Omit<RelationOutput, 'count'> };
  /** Include count of related records */
  count?: boolean;
};

export type RelationType = 'oneToOne' | 'oneToMany' | 'manyToMany';

export type RelationField = {
  /** Related resource model name */
  model: string;
  /** Relation cardinality between the two models:
   * `'oneToOne'` — both sides reference a single record, the owning side holds
   * a unique foreign key.
   * `'oneToMany'` — the owning side (`owner: true`) holds the foreign key and
   * references a single record, the inverse side holds a list.
   * `'manyToMany'` — both sides hold lists, joined through an implicit table. */
  type: RelationType;
  /** Inverse relation field name on the related model */
  mappedBy?: string;
  /** Whether this side owns the foreign key column in the generated table.
   * Applies to `oneToOne` and `oneToMany` relations. */
  owner?: boolean;
  /** Input configuration for this relation */
  input?: RelationInput;
  /** Output configuration for this relation */
  output?: RelationOutput;
  /** Minimum number of related items required */
  minItems?: number;
  /** Relation must be provided on creation */
  required?: boolean;
  /** Delete orphaned related records on update */
  orphanRemoval?: boolean;
  /** Referential action on delete */
  onDelete?: ReferentialAction;
  /** Referential action on update */
  onUpdate?: ReferentialAction;
};

export type ImageFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export type ImageConfig = {
  /** Compression quality (1-100). Applies to JPEG, PNG, WebP, AVIF, and TIFF. */
  quality?: number;
  /** Exact resize width in pixels. Takes precedence over maxWidth. */
  width?: number;
  /** Exact resize height in pixels. Takes precedence over maxHeight. */
  height?: number;
  /** Maximum width in pixels. Only downscales if the image exceeds this value. */
  maxWidth?: number;
  /** Maximum height in pixels. Only downscales if the image exceeds this value. */
  maxHeight?: number;
  /** How the image should be resized to fit the provided dimensions.
   * `'inside'` (default) preserves an aspect ratio within the given dimensions.
   * Other options: `'contain'`, `'cover'`, `'fill'`, `'outside'`. */
  fit?: ImageFit;
};

export type FileField<T = any> = {
  /** Allowed MIME type(s) or regex pattern */
  mimeType?: string | RegExp;
  /** Storage path pattern or factory function which accepts MultipartFile data
   * and related resource arguments */
  namePattern?: string | ((file: MultipartFile, resource: T) => string);
  /** Allow multiple file uploads */
  array?: boolean;
  /** Maximum file size (bytes or human-readable string) */
  maxSize?: number | string;
  /** Maximum number of files */
  maxCount?: number;
  /** Output configuration for the file relation */
  output?: Omit<RelationOutput, 'include'>;
  /** Action to take on associated files when the owning resource is deleted.
   * `'delete'` (default) removes files from storage, `'keep'` leaves them. */
  onResourceDeleted?: 'delete' | 'keep';
  /** Image compression and resizing configuration. Only applies to image files
   * (JPEG, PNG, WebP, AVIF, TIFF). GIF files are passed through unchanged. */
  image?: ImageConfig;
};

export type OperationConfig = {
  /** Fields to exclude from the operation */
  omit?: string[];
  /** Fields to include exclusively */
  pick?: string[];
};

export type VirtualInput<T = any> = {
  /** Which operations accept this virtual field */
  type?: InputType;
  /** Static value or factory function */
  value?:
    | PrimitiveType
    | ObjectType
    | ((resource: T) => PrimitiveType | ObjectType);
};

export type VirtualOutput<T = any> = {
  /** Which operations expose this virtual field */
  type?: OutputType;
  /** Static value or factory function */
  value?:
    | PrimitiveType
    | ObjectType
    | ((resource: T) => PrimitiveType | ObjectType);
};

export type VirtualField<T = any> = ScalarField & {
  /** Input behavior for this virtual field */
  input?: VirtualInput<T>;
  /** Output behavior for this virtual field */
  output?: VirtualOutput<T>;
};

export type ExportField<T = any> = {
  /** Column header in the exported file */
  headerName?: string;
  /** Exclude this field from exports */
  exclude?: boolean;
  /** Transform the value for export output */
  mapValue?: string | ((value: T) => string);
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

/** Indexed field name, optionally prefixed with `-` for descending or `+` for
 * ascending sort order (e.g. `-createdAt`). Without a prefix, the database
 * default order is used. */
export type IndexField = string;

export type IndexConfig = (IndexField | IndexField[])[];

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
