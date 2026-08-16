import {
  isArray,
  isBoolean,
  isNumber,
  isString,
  ResourceModel,
  ScalarField
} from '@appweaver/common';

/**
 * Validates that the default value of every scalar and virtual field satisfies
 * the constraints declared on that same field. A default outside its own
 * constraints produces records that do not match the output schema of their
 * model, which only surfaces once the model is nested in a nullable relation,
 * where the response serializer validates it before picking a schema branch.
 *
 * @param {Record<string, ResourceModel>} models - All loaded models keyed by name.
 * @throws {Error} When any default value violates the constraints of its field.
 */
export function validateScalarDefaults(
  models: Record<string, ResourceModel>
): void {
  const errors: string[] = [];

  for (const model of Object.values(models)) {
    const fields = {
      ...(model.config.scalars ?? {}),
      ...(model.config.virtual ?? {})
    };

    for (const [name, field] of Object.entries(fields)) {
      for (const error of defaultValueErrors(field)) {
        errors.push(`'${model.name}.${name}' ${error}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid resource model default values:\n${errors
        .map((error) => `  - ${error}`)
        .join('\n')}`
    );
  }
}

/** @internal */
function defaultValueErrors(field: ScalarField): string[] {
  if (field.default === undefined) {
    return [];
  }

  // An array field defaults to a list of values, each validated on its own
  const values = field.array
    ? isArray(field.default)
      ? field.default
      : [field.default]
    : [field.default];

  return values.flatMap((value: any) => defaultErrors(field, value));
}

/** @internal */
function defaultErrors(field: ScalarField, value: any): string[] {
  const errors: string[] = [];

  const invalidType = (expected: string) =>
    `has a default value of ${JSON.stringify(value)}, which is not ${expected}`;

  const violates = (constraint: string, limit: unknown) =>
    `has a default value of ${JSON.stringify(value)}, which violates its ` +
    `own ${constraint} of ${JSON.stringify(limit)}`;

  switch (field.type) {
    case 'string':
      if (!isString(value)) {
        return [invalidType('a string')];
      }
      if (field.minLength !== undefined && value.length < field.minLength) {
        errors.push(violates('minLength', field.minLength));
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push(violates('maxLength', field.maxLength));
      }
      if (
        field.pattern !== undefined &&
        !matchesPattern(value, field.pattern)
      ) {
        errors.push(violates('pattern', field.pattern));
      }
      break;

    case 'int':
    case 'bigInt':
    case 'float':
      if (!isNumber(value)) {
        return [invalidType('a number')];
      }
      if (field.type !== 'float' && !Number.isInteger(value)) {
        return [invalidType('an integer')];
      }
      if (field.minimum !== undefined && value < field.minimum) {
        errors.push(violates('minimum', field.minimum));
      }
      if (field.maximum !== undefined && value > field.maximum) {
        errors.push(violates('maximum', field.maximum));
      }
      break;

    case 'boolean':
      if (!isBoolean(value)) {
        errors.push(invalidType('a boolean'));
      }
      break;

    case 'dateTime':
      if (
        !(value instanceof Date) &&
        (!isString(value) || Number.isNaN(Date.parse(value)))
      ) {
        errors.push(invalidType('a valid date'));
      }
      break;

    case 'enum':
      if (!(field.values ?? []).includes(value)) {
        errors.push(violates('allowed values', field.values ?? []));
      }
      break;
  }

  return errors;
}

/** Tests a value against a field pattern, skipping patterns that are not valid
 * regular expressions since they cannot be evaluated. @internal */
function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}
