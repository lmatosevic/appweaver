import {
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
    ...options
  });
};

export const StringDate = (
  options: Parameters<typeof Type.Unsafe<Date>>[0] & {
    format?: 'date' | 'date-time';
  } = {}
) => Type.Unsafe<Date>({ type: 'string', format: 'date-time', ...options });

export const Nullable = <T extends TSchema>(schema: T) =>
  Type.Optional(
    Type.Unsafe<Static<T> | null>({
      ...schema,
      ...(TypeGuard.IsUnion(schema) ? {} : { nullable: true })
    })
  );
