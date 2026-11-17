import { Static, TSchema } from '@sinclair/typebox';
import { TypeCompiler, TypeCheck } from '@sinclair/typebox/compiler';
import {
  ErrorCode,
  RealtimeError,
  registerSchemaFormats
} from '@appweaver/common';

const compiled = new WeakMap<TSchema, TypeCheck<TSchema>>();

/**
 * Checks a value against a schema, compiled once per schema, with the string formats of `registerSchemaFormats`.
 *
 * @param {TSchema} schema - The schema.
 * @param {unknown} value - The value to check.
 * @return {Object} The value, typed by the schema.
 * @throws {RealtimeError} `REALTIME_PAYLOAD_INVALID` with the errors of the value.
 */
export function validatePayload<T extends TSchema>(
  schema: T,
  value: unknown
): Static<T> {
  let check = compiled.get(schema);
  if (!check) {
    registerSchemaFormats();
    check = TypeCompiler.Compile(schema);
    compiled.set(schema, check);
  }

  if (!check.Check(value)) {
    const errors = [...check.Errors(value)].slice(0, 10).map((e) => ({
      path: e.path || '/',
      message: e.message
    }));
    throw new RealtimeError(
      ErrorCode.RealtimePayloadInvalid,
      'Invalid realtime payload',
      { errors }
    );
  }

  return value;
}
