import {
  AppweaverError,
  ErrorCode,
  ErrorDetails,
  isAppweaverError,
  ModuleErrorCode,
  ResourceModel
} from '@appweaver/common';
import { injectModel } from '../context';

type DatabaseErrorCode = ModuleErrorCode<'DATABASE'>;

/** The constraint a driver adapter reports as violated. */
type AdapterConstraint =
  | { fields: string[] }
  | { index: string }
  | { foreignKey: Record<string, unknown> };

type PrismaError = Error & {
  code?: string;
  errorCode?: string;
  meta?: {
    modelName?: string;
    target?: string | string[];
    column_name?: string;
    field_name?: string;
    driverAdapterError?: {
      cause?: {
        kind?: string;
        constraint?: AdapterConstraint;
        column?: string;
      };
    };
  };
};

/** The error codes of the error kinds a driver adapter reports. */
const ADAPTER_KINDS: Record<string, DatabaseErrorCode> = {
  UniqueConstraintViolation: ErrorCode.DatabaseUniqueViolation,
  ForeignKeyConstraintViolation: ErrorCode.DatabaseForeignKeyViolation,
  NullConstraintViolation: ErrorCode.DatabaseNullViolation,
  LengthMismatch: ErrorCode.DatabaseValueTooLong,
  ValueOutOfRange: ErrorCode.DatabaseValueOutOfRange,
  InvalidInputValue: ErrorCode.DatabaseInvalidValue,
  InconsistentColumnData: ErrorCode.DatabaseInvalidValue,
  TransactionWriteConflict: ErrorCode.DatabaseWriteConflict
};

/** The error codes of the Prisma error codes. */
const PRISMA_CODES: Record<string, DatabaseErrorCode> = {
  P2000: ErrorCode.DatabaseValueTooLong,
  P2002: ErrorCode.DatabaseUniqueViolation,
  P2003: ErrorCode.DatabaseForeignKeyViolation,
  P2006: ErrorCode.DatabaseInvalidValue,
  P2007: ErrorCode.DatabaseInvalidValue,
  P2011: ErrorCode.DatabaseNullViolation,
  P2020: ErrorCode.DatabaseValueOutOfRange,
  P2023: ErrorCode.DatabaseInvalidValue,
  P2025: ErrorCode.DatabaseRecordNotFound,
  P2034: ErrorCode.DatabaseWriteConflict
};

// The connection errors, a connection pool timeout and too many connections
const UNAVAILABLE_CODES = /^P10\d\d$|^P2024$|^P2037$/;

/**
 * An error of a database operation, i.e. a violated constraint. Raised by
 * {@link toDatabaseError} from the errors of the Prisma client.
 */
export class DatabaseError<
  C extends DatabaseErrorCode = DatabaseErrorCode
> extends AppweaverError<C> {
  public readonly module = 'database';
}

/**
 * Checks whether an error was raised by the Prisma client.
 */
export function isPrismaError(error: unknown): error is PrismaError {
  return (
    error instanceof Error &&
    (error.name.startsWith('PrismaClient') ||
      /^P\d{4}$/.test(String((error as PrismaError).code)))
  );
}

/**
 * Translates an error of the Prisma client into a {@link DatabaseError}
 * describing what failed, i.e. which fields violate a unique constraint. Any
 * other error, i.e. an {@link AppweaverError} or a bug of the code the
 * operation runs, is returned as it is.
 *
 * @param {unknown} error The error the operation failed with.
 * @param {string} [model] The name of the model the operation ran on, used when
 * the error does not name one.
 * @returns {unknown} The translated error keeping the Prisma error as its
 * cause, or the error as it is.
 */
export function toDatabaseError(error: unknown, model?: string): unknown {
  if (isAppweaverError(error) || !isPrismaError(error)) {
    return error;
  }

  const options = { cause: error };
  const prismaCode = error.code ?? error.errorCode;
  const modelName = error.meta?.modelName ?? model;
  const cause = error.meta?.driverAdapterError?.cause;
  const code =
    (cause?.kind ? ADAPTER_KINDS[cause.kind] : undefined) ??
    (prismaCode ? PRISMA_CODES[prismaCode] : undefined) ??
    validationErrorCode(error);

  if (!code) {
    if (prismaCode && UNAVAILABLE_CODES.test(prismaCode)) {
      return new DatabaseError(
        ErrorCode.DatabaseUnavailable,
        'Database is unavailable',
        {},
        options
      );
    }
    return new DatabaseError(
      ErrorCode.DatabaseOperationFailed,
      `${modelName ?? 'Database'} operation failed`,
      { model: modelName, prismaCode },
      options
    );
  }

  const subject = modelName ?? 'Record';

  switch (code) {
    case ErrorCode.DatabaseRecordNotFound:
      return new DatabaseError(
        code,
        `${subject} not found`,
        { model: modelName },
        options
      );
    case ErrorCode.DatabaseWriteConflict:
      return new DatabaseError(
        code,
        `${subject} was changed by a concurrent operation, retry the operation`,
        { model: modelName },
        options
      );
  }

  const constraint = cause?.constraint;
  const fields = violatedFields(error, modelName, cause?.column);
  const details: ErrorDetails<typeof code> = {
    model: modelName,
    fields,
    ...(constraint && 'index' in constraint
      ? { constraint: constraint.index }
      : {})
  };

  return new DatabaseError(
    code,
    violationMessage(code, subject, fields),
    details,
    options
  );
}

/**
 * Returns the explanation of a Prisma error, without the invocation and the
 * code frame its message starts with, i.e. "Unique constraint failed on the
 * fields: (`email`)".
 */
export function prismaErrorMessage(error: Error): string {
  const lines = error.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? error.name;
}

/** The violations the Prisma client reports before reaching the database. */
function validationErrorCode(
  error: PrismaError
): DatabaseErrorCode | undefined {
  if (error.name !== 'PrismaClientValidationError') {
    return undefined;
  }
  return /Argument `\w+` is missing/.test(error.message)
    ? ErrorCode.DatabaseNullViolation
    : undefined;
}

/** Returns the model fields an error reports as violated, normalized from the
 * columns the database reports. */
function violatedFields(
  error: PrismaError,
  modelName: string | undefined,
  column: string | undefined
): string[] {
  const model = modelName ? injectModel(modelName, false) : undefined;
  return reportedColumns(error, column, model).map((name) =>
    modelField(unquote(name), model)
  );
}

/** Returns the columns an error reports as violated, the ones of a named index
 * resolved from the constraints of its model. */
function reportedColumns(
  error: PrismaError,
  column: string | undefined,
  model: ResourceModel | undefined
): string[] {
  const constraint = error.meta?.driverAdapterError?.cause?.constraint;

  if (constraint && 'fields' in constraint) {
    return constraint.fields;
  }
  if (constraint && 'index' in constraint) {
    return indexColumns(constraint.index, model);
  }
  if (column) {
    return [column];
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target;
  }
  if (typeof target === 'string') {
    return indexColumns(target, model);
  }

  const missing = error.message.match(/Argument `(\w+)` is missing/);
  if (missing) {
    return [missing[1]];
  }

  const field = error.meta?.field_name ?? error.meta?.column_name;
  return field ? [field] : [];
}

/**
 * Returns the model field a column holds: the relation of a foreign key
 * column, i.e. `author` for `authorId`, and the column itself otherwise. A
 * column reported with its table, i.e. `Post.title`, is stripped of it.
 */
function modelField(column: string, model: ResourceModel | undefined): string {
  const name = column.slice(column.lastIndexOf('.') + 1);
  const relation = name.endsWith('Id') ? name.slice(0, -2) : undefined;
  return relation && model?.config.relations?.[relation] ? relation : name;
}

/**
 * Resolves the columns of a named index from the constraints of its model,
 * following the default Prisma naming of `<Table>_<columns>_key` for a unique
 * constraint and `<Table>_<column>_fkey` for a foreign key.
 */
function indexColumns(
  index: string,
  model: ResourceModel | undefined
): string[] {
  if (!model) {
    return [];
  }

  const table = model.config.tableName ?? model.name;
  const candidates: string[][] = [
    ...(model.config.unique ?? []).map((entry) =>
      (Array.isArray(entry) ? entry : [entry]).map(stripOrder)
    ),
    ...Object.entries(model.config.scalars ?? {})
      .filter(([, scalar]) => scalar.unique)
      .map(([name]) => [name]),
    ...Object.keys(model.config.relations ?? {}).map((name) => [`${name}Id`])
  ];

  return (
    candidates.find((columns) =>
      ['key', 'fkey'].some(
        (suffix) => index === `${table}_${columns.join('_')}_${suffix}`
      )
    ) ?? []
  );
}

function violationMessage(
  code: DatabaseErrorCode,
  subject: string,
  fields: string[]
): string {
  const quoted = fields.map((field) => `'${field}'`).join(', ');
  const plural = fields.length > 1;

  switch (code) {
    case ErrorCode.DatabaseUniqueViolation:
      return fields.length > 0
        ? `${subject} with the same ${fields.join(' and ')} already exists`
        : `${subject} violates a unique constraint`;
    case ErrorCode.DatabaseNullViolation:
      return fields.length > 0
        ? `${subject} field${plural ? 's' : ''} ${quoted} ${plural ? 'are' : 'is'} required`
        : `${subject} is missing a required field`;
    case ErrorCode.DatabaseValueTooLong:
      return fields.length > 0
        ? `${subject} field ${quoted} value is too long`
        : `${subject} field value is too long`;
    case ErrorCode.DatabaseValueOutOfRange:
      return fields.length > 0
        ? `${subject} field ${quoted} value is out of range`
        : `${subject} field value is out of range`;
    case ErrorCode.DatabaseForeignKeyViolation:
      return fields.length > 0
        ? `${subject} relation ${quoted} references a missing record, or is still referenced by another record`
        : `${subject} violates a relation constraint`;
    default:
      return fields.length > 0
        ? `${subject} field ${quoted} value is invalid`
        : `${subject} field value is invalid`;
  }
}

function unquote(name: string): string {
  return name.replace(/^[`"[]|[`"\]]$/g, '');
}

function stripOrder(field: string): string {
  return field.replace(/^[-+]/, '');
}
