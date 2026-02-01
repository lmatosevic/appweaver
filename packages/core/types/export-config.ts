import { BaseType, IsObject } from '@appweaver/common';

export type ExportConfigRelation<Relation = any> =
  | ExportConfig<BaseType<Relation>>
  | Partial<{
      [Key in keyof BaseType<Relation>]: ExportConfigRelation<
        BaseType<Relation>[Key]
      >;
    }>;

export type ExportConfig<T = any> = {
  exclude?: boolean;
  headerName?: string;
  mapValue?: IsObject<T> extends true
    ? ((value: T) => string) | string
    : (value: T) => string;
};

export type ExportConfigProps<
  Model = any,
  Relations = any,
  Files = any
> = Partial<
  {
    [Key in keyof Model]: ExportConfig<Model[Key]>;
  } & {
    [Key in keyof Relations]: ExportConfigRelation<Relations[Key]>;
  } & {
    [Key in keyof Files]: ExportConfigRelation<Files[Key]>;
  }
>;
