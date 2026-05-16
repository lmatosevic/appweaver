import {
  Kind,
  Static,
  StringOptions,
  TSchema,
  Type,
  TypeGuard
} from '@sinclair/typebox';

/**
 * Defines a string-based enumerated type derived from the values of an object.
 *
 * @template T - An object whose values represent the valid string enumeration options.
 *
 * @param {T} value - An object containing the valid values for the enumeration. The values of this object must be
 * strings, as they will form the enumeration.
 * @param {StringOptions} [options={}] - Optional configuration options that can be passed to customize the resulting
 * string enumeration.
 *
 * @returns A type-safe string enumeration constructed from the values of the provided object.
 */
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

/**
 * A function that returns a type definition representing a string formatted as a date-time.
 *
 * This function uses the `Type.Unsafe` method to define a custom type for a date string.
 * The resulting type expects a `string` with the format `date-time`, as per ISO 8601 standard.
 *
 * The type includes metadata such as example value and an optional set of additional properties
 * passed through the `options` parameter.
 *
 * @param {object} [options={}] - Optional configuration object to extend the base type definition.
 *                                It accepts all properties that can be used with `Type.Unsafe`.
 * @returns A type definition for a string formatted as a `date-time`.
 */
export const StringDate = (
  options: Parameters<typeof Type.Unsafe<Date>>[0] = {}
) =>
  Type.Unsafe<Date>({
    type: 'string',
    format: 'date-time',
    example: '2026-03-24T16:35:09.521Z',
    [Kind]: 'String',
    ...options
  });

/**
 * Creates a generic JSON type schema with optional customization.
 *
 * This utility generates a type schema that matches any JSON-valid structure.
 * It merges a base schema with additional options if provided, allowing
 * for more flexible and tailored type definitions.
 *
 * @param {object} [options={}] - An optional object containing additional configuration
 * for the type schema. These options are passed to `Type.Unsafe`.
 * @returns A schema representing a type that matches any valid JSON structure,
 * extended with the specified customizations.
 */
export const AnyJson = (options: Parameters<typeof Type.Unsafe<any>>[0] = {}) =>
  Type.Any({
    example: {},
    ...options
  });

/**
 * A utility function that makes a given schema nullable by allowing it to accept `null` values.
 *
 * The function produces a schema that includes either the provided schema type or `null`.
 * It ensures compatibility with various schema constructs by safely handling unions,
 * references, and other cases where the schema might already include or allow nullable behavior.
 *
 * @template T - The base schema type that the function should make nullable.
 * @param {T} schema - The schema to be extended with nullability support.
 * @returns Returns an optional schema that accepts both the original type and the `null` type.
 */
export const Nullable = <T extends TSchema>(schema: T) =>
  Type.Optional(
    Type.Unsafe<Static<T> | null>({
      ...(TypeGuard.IsUnion(schema) ||
      TypeGuard.IsAny(schema) ||
      TypeGuard.IsRef(schema)
        ? Type.Union([schema, Type.Null()])
        : { ...schema, nullable: true })
    })
  );

/**
 * A utility function that builds a TypeScript Enum schema using specified string values,
 * adhering to the `TypeBox` library's schema definition requirements.
 *
 * @template T - A type constraint extending from `TSchema`, representing the schema type.
 * @param {string[]} [values] - An optional array of strings to define the enum values.
 *                               Each string in the array becomes both the key and value
 *                               in the resulting enum definition.
 * @returns A schema object representing the constructed enum definition.
 */
export const EnumType = <T extends TSchema>(values?: string[]) =>
  Type.Enum(Object.fromEntries(values?.map((k) => [k, k]) ?? []));

/**
 * Represents a custom date type schema with optional formatting options.
 *
 * This type allows the creation of a date schema with additional flexibility to specify
 * the format of the date. The default format is 'date-time', but it can be overridden
 * with 'date' if specified in the options.
 *
 * @template T - Extends a base schema type.
 * @param {Object} options - Configuration options for the custom date type schema.
 * @param {'date' | 'date-time'} [options.format] - Optional format of the date.
 *        Defaults to 'date-time'.
 * @returns Returns a schema object representing the date configuration.
 */
export const DateType = <T extends TSchema>(
  options: Parameters<typeof Type.Unsafe<Date>>[0] & {
    format?: 'date' | 'date-time';
  } = {}
) => Type.Date({ format: 'date-time', ...options });

/**
 * Constructs a new type that wraps a given schema, making it optionally null.
 *
 * This utility takes a schema and returns a new schema that is the union of the original schema
 * and a null type, allowing the resulting type to accept `null` as a valid value. Furthermore,
 * the resulting type is marked as optional, meaning it can be omitted from objects where it's used.
 *
 * @template T The base schema type to which `null` and optionality are added.
 * @param {T} schema The schema to extend with `null` and optionality.
 * @returns A new schema type combining the provided schema, nullability, and optionality.
 */
export const NullType = <T extends TSchema>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()]));
