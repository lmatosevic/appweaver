import {
  Kind,
  Static,
  StringOptions,
  TSchema,
  Type,
  TypeGuard
} from '@sinclair/typebox';

export const EnumType = <T extends TSchema>(values?: string[]) =>
  Type.Enum(Object.fromEntries(values?.map((k) => [k, k]) ?? []));

export const StringEnum = <T extends object>(
  value: T,
  options: StringOptions = {}
) => {
  return Type.Unsafe<T[keyof T]>({
    type: 'string',
    enum: Object.values(value),
    [Kind]: 'String',
    ...options
  });
};

export const DateType = <T extends TSchema>(
  options: Parameters<typeof Type.Unsafe<Date>>[0] & {
    format?: 'date' | 'date-time';
  } = {}
) => Type.Date({ format: 'date-time', ...options });

export const StringDate = (
  options: Parameters<typeof Type.Unsafe<Date>>[0] & {
    format?: 'date' | 'date-time';
  } = {}
) =>
  Type.Unsafe<Date>({
    type: 'string',
    format: 'date-time',
    [Kind]: 'String',
    ...options
  });

export const NullType = <T extends TSchema>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()], { nullable: true }));

export const Nullable = <T extends TSchema>(schema: T) =>
  Type.Optional(
    Type.Unsafe<Static<T> | null>({
      ...schema,
      ...(TypeGuard.IsUnion(schema) ? {} : { nullable: true })
    })
  );
