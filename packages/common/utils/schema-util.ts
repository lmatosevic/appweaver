import {
  Kind,
  Static,
  StringOptions,
  TSchema,
  Type,
  TypeGuard
} from '@sinclair/typebox';

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

export const StringDate = (
  options: Parameters<typeof Type.Unsafe<Date>>[0] = {}
) =>
  Type.Unsafe<Date>({
    type: 'string',
    format: 'date-time',
    [Kind]: 'String',
    examples: [new Date().toISOString()],
    ...options
  });

export const AnyJson = (options: Parameters<typeof Type.Unsafe<any>>[0] = {}) =>
  Type.Any({
    examples: [{}],
    ...options
  });

export const Nullable = <T extends TSchema>(schema: T) =>
  Type.Optional(
    Type.Unsafe<Static<T> | null>({
      ...schema,
      ...(TypeGuard.IsUnion(schema) || TypeGuard.IsAny(schema)
        ? Type.Union([schema, Type.Null()])
        : { nullable: true })
    })
  );

export const EnumType = <T extends TSchema>(values?: string[]) =>
  Type.Enum(Object.fromEntries(values?.map((k) => [k, k]) ?? []));

export const DateType = <T extends TSchema>(
  options: Parameters<typeof Type.Unsafe<Date>>[0] & {
    format?: 'date' | 'date-time';
  } = {}
) => Type.Date({ format: 'date-time', ...options });

export const NullType = <T extends TSchema>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()], { nullable: true }));
