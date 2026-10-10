import { ErrorCode } from '@appweaver/common';
import {
  isPrismaError,
  prismaErrorMessage,
  toDatabaseError
} from '../../database/database-error';
import { createModel } from '../../factory/create-model';
import { ResourceError } from '../../resource/resource-error';
import { resetContext } from '../fixtures/context-fixture';

/** Creates an error shaped like a known request error of the Prisma client. */
const prismaError = (
  code: string,
  meta: Record<string, unknown> = {},
  message = 'Prisma failed'
) =>
  Object.assign(new Error(message), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta
  });

/** The metadata of a driver adapter error of the given kind. */
const adapterMeta = (
  modelName: string,
  kind: string,
  cause: Record<string, unknown> = {}
) => ({ modelName, driverAdapterError: { cause: { kind, ...cause } } });

describe('database-error', () => {
  beforeEach(() => {
    resetContext();
    createModel({
      name: 'Team',
      scalars: { name: { type: 'string' } }
    });
    createModel({
      name: 'Member',
      scalars: {
        email: { type: 'string', unique: true },
        slug: { type: 'string' },
        tenant: { type: 'string' }
      },
      relations: { team: { model: 'Team', type: 'oneToMany', owner: true } },
      unique: [['slug', 'tenant']]
    });
  });

  describe('isPrismaError', () => {
    test('recognizes the errors of the Prisma client', () => {
      expect(isPrismaError(prismaError('P2002'))).toBe(true);
      expect(
        isPrismaError(
          Object.assign(new Error('x'), { name: 'PrismaClientValidationError' })
        )
      ).toBe(true);
    });

    test('rejects other errors', () => {
      expect(isPrismaError(new Error('x'))).toBe(false);
      expect(isPrismaError({ code: 'P2002' })).toBe(false);
    });
  });

  describe('toDatabaseError', () => {
    test('returns an AppweaverError as it is', () => {
      const error = new ResourceError(ErrorCode.ResourceNotFound, 'Missing', {
        model: 'Member'
      });

      expect(toDatabaseError(error, 'Member')).toBe(error);
    });

    test('returns an error not raised by the Prisma client as it is', () => {
      const error = new TypeError('Cannot read properties of undefined');

      expect(toDatabaseError(error, 'Member')).toBe(error);
    });

    test('reports a foreign key column as its relation', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2003',
          adapterMeta('Member', 'ForeignKeyConstraintViolation', {
            constraint: { fields: ['"teamId"'] }
          })
        )
      );

      expect(error).toMatchObject({ details: { fields: ['team'] } });
    });

    test('strips the table of a reported column', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2000',
          adapterMeta('Member', 'LengthMismatch', { column: 'Member.slug' })
        )
      );

      expect(error).toMatchObject({ details: { fields: ['slug'] } });
    });

    test('translates a unique violation reported with its fields', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2002',
          adapterMeta('Member', 'UniqueConstraintViolation', {
            constraint: { fields: ['email'] }
          })
        )
      );

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseUniqueViolation,
        message: 'Member with the same email already exists',
        details: { model: 'Member', fields: ['email'] }
      });
    });

    test('resolves the fields of a unique violation reported by its index', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2002',
          adapterMeta('Member', 'UniqueConstraintViolation', {
            constraint: { index: 'Member_slug_tenant_key' }
          })
        )
      );

      expect(error).toMatchObject({
        message: 'Member with the same slug and tenant already exists',
        details: {
          fields: ['slug', 'tenant'],
          constraint: 'Member_slug_tenant_key'
        }
      });
    });

    test('resolves the fields of a single field unique index', () => {
      const error: any = toDatabaseError(
        prismaError('P2002', {
          modelName: 'Member',
          target: 'Member_email_key'
        })
      );

      expect(error.details).toMatchObject({ fields: ['email'] });
    });

    test('resolves the relation of a foreign key index', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2003',
          adapterMeta('Member', 'ForeignKeyConstraintViolation', {
            constraint: { index: 'Member_teamId_fkey' }
          })
        )
      );

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseForeignKeyViolation,
        details: { fields: ['team'] }
      });
    });

    test('leaves the fields of an unknown index empty', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2002',
          adapterMeta('Member', 'UniqueConstraintViolation', {
            constraint: { index: 'custom_index' }
          })
        )
      );

      expect(error).toMatchObject({
        message: 'Member violates a unique constraint',
        details: { fields: [], constraint: 'custom_index' }
      });
    });

    test('translates the violation of a raw query by its adapter kind', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2010',
          adapterMeta('Member', 'NullConstraintViolation', {
            constraint: { fields: ['"slug"'] }
          })
        )
      );

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseNullViolation,
        message: "Member field 'slug' is required"
      });
    });

    test('translates a value too long for its column', () => {
      const error: any = toDatabaseError(
        prismaError(
          'P2000',
          adapterMeta('Member', 'LengthMismatch', { column: 'slug' })
        )
      );

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseValueTooLong,
        message: "Member field 'slug' value is too long",
        details: { fields: ['slug'] }
      });
    });

    test('translates a missing argument of the client validation', () => {
      const error: any = toDatabaseError(
        Object.assign(new Error('Argument `slug` is missing.'), {
          name: 'PrismaClientValidationError'
        }),
        'Member'
      );

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseNullViolation,
        details: { model: 'Member', fields: ['slug'] }
      });
    });

    test('translates a record that is not found', () => {
      expect(
        toDatabaseError(prismaError('P2025', { modelName: 'Member' }))
      ).toMatchObject({
        code: ErrorCode.DatabaseRecordNotFound,
        message: 'Member not found'
      });
    });

    test('translates a write conflict', () => {
      expect(toDatabaseError(prismaError('P2034'), 'Member')).toMatchObject({
        code: ErrorCode.DatabaseWriteConflict
      });
    });

    test('translates a connection error', () => {
      expect(toDatabaseError(prismaError('P1001'))).toMatchObject({
        code: ErrorCode.DatabaseUnavailable
      });
    });

    test('keeps the Prisma code of an untranslated error', () => {
      const cause = prismaError('P2016', { modelName: 'Member' });

      const error: any = toDatabaseError(cause);

      expect(error).toMatchObject({
        code: ErrorCode.DatabaseOperationFailed,
        details: { model: 'Member', prismaCode: 'P2016' }
      });
      expect(error.cause).toBe(cause);
    });
  });

  describe('prismaErrorMessage', () => {
    test('returns the explanation without the invocation and code frame', () => {
      const error = new Error(
        [
          '',
          'Invalid `prisma.user.create()` invocation in',
          '/app/src/user.ts:4:21',
          '',
          '  3 |',
          '→ 4 |   await db.user.create(',
          '',
          'Unique constraint failed on the fields: (`email`)'
        ].join('\n')
      );

      expect(prismaErrorMessage(error)).toBe(
        'Unique constraint failed on the fields: (`email`)'
      );
    });

    test('falls back to the name of an error without a message', () => {
      const error = Object.assign(new Error(''), {
        name: 'PrismaClientUnknownRequestError'
      });

      expect(prismaErrorMessage(error)).toBe('PrismaClientUnknownRequestError');
    });
  });
});
