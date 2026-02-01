import { BaseType, BaseTypeKey, IsObject } from '@appweaver/common';

export type OutputType = 'always' | 'single' | 'multiple' | 'none';

export type InputType = 'all' | 'create' | 'update' | 'none';

export type IncludeRelationType<Relation = any> = Partial<{
  [Key in keyof BaseType<Relation> as IsObject<
    BaseType<Relation>[Key]
  > extends true
    ? Key
    : never]: boolean | IncludeRelationType<BaseType<Relation>[Key]>;
}>;

export type RelationConfig<Relation = any> = {
  inputType?: InputType;
  includeRelations?: IncludeRelationType<Relation>;
  outputType?: OutputType;
  outputCount?: boolean;
  optional?: boolean;
  createIfNotExists?: boolean;
  orphanRemoval?: boolean;
  inputUniqueKey?: BaseTypeKey<Relation>;
  inputAdditionalProps?: Array<BaseTypeKey<Relation>>;
  inputOptionalProps?: Array<BaseTypeKey<Relation>>;
};

export type RelationConfigProps<Relations = any> = Partial<{
  [Key in keyof Relations]: RelationConfig<Relations[Key]>;
}>;
