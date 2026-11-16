import { configOverrides, ErrorCode } from '@appweaver/common';
import { migrationUrl } from '../../database/database-config';

describe('database-config', () => {
  afterEach(() => {
    delete configOverrides.DATABASE_URL;
    delete configOverrides.DATABASE_MIGRATION_URL;
    delete configOverrides.DATABASE_TYPE;
  });

  describe('migrationUrl', () => {
    test('is the URL of the application without a migration URL', () => {
      configOverrides.DATABASE_URL = 'postgresql://app:pw@localhost:5432/shop';

      expect(migrationUrl()).toBe('postgresql://app:pw@localhost:5432/shop');
    });

    test('is the migration URL when set', () => {
      configOverrides.DATABASE_URL = 'postgresql://app:pw@pooler:6432/shop';
      configOverrides.DATABASE_MIGRATION_URL =
        'postgresql://owner:pw@localhost:5432/shop?schema=public';

      expect(migrationUrl()).toBe(
        'postgresql://owner:pw@localhost:5432/shop?schema=public'
      );
    });

    test('is the migration URL without a URL of the application', () => {
      configOverrides.DATABASE_MIGRATION_URL = 'file:./data/shop.db';

      expect(migrationUrl()).toBe('file:./data/shop.db');
    });

    test.each([
      [
        'mysql://app:pw@localhost:3306/shop',
        'mysql://owner:pw@localhost:3306/shop'
      ],
      [
        'sqlserver://localhost:1433;database=shop;user=app;password=pw',
        'sqlserver://localhost:1433;Database=shop;user=sa;password=pw'
      ],
      ['file:./data/shop.db', 'file:data/shop.db?connection_limit=1']
    ])('accepts the same database: %s', (url, migration) => {
      configOverrides.DATABASE_URL = url;
      configOverrides.DATABASE_MIGRATION_URL = migration;

      expect(migrationUrl()).toBe(migration);
    });

    test.each([
      [
        'postgresql://app:pw@localhost:5432/shop',
        'mysql://owner:pw@localhost:3306/shop',
        'points to the mysql database shop, while DATABASE_URL (config.database.url) points to the postgresql database shop'
      ],
      [
        'postgresql://app:pw@localhost:5432/shop-test',
        'postgresql://owner:pw@localhost:5432/shop',
        'points to the postgresql database shop, while DATABASE_URL (config.database.url) points to the postgresql database shop-test'
      ],
      [
        'sqlserver://localhost:1433;database=shop',
        'sqlserver://localhost:1433;initial catalog=other',
        'the sqlserver database other'
      ],
      ['file:./data/shop.db', 'file:./data/test.db', 'database data/test.db']
    ])('rejects another database: %s', (url, migration, message) => {
      configOverrides.DATABASE_URL = url;
      configOverrides.DATABASE_MIGRATION_URL = migration;

      expect(() => migrationUrl()).toThrow(
        expect.objectContaining({
          code: ErrorCode.ConfigurationInvalid,
          message: expect.stringContaining(message)
        })
      );
    });

    test('compares the URLs whatever the type of the config', () => {
      configOverrides.DATABASE_TYPE = 'postgresql';
      configOverrides.DATABASE_URL = 'postgresql://app:pw@localhost:5432/shop';
      configOverrides.DATABASE_MIGRATION_URL =
        'mysql://owner:pw@localhost/shop';

      expect(() => migrationUrl()).toThrow(/mysql database/);
    });

    test('compares no name of an invalid URL', () => {
      configOverrides.DATABASE_URL = 'postgresql://app:pw@localhost:5432/shop';
      configOverrides.DATABASE_MIGRATION_URL = 'postgresql://[invalid';

      expect(() => migrationUrl()).toThrow(
        'the postgresql database, while DATABASE_URL'
      );
    });
  });
});
