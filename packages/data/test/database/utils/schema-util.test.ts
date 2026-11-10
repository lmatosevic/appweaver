import { configOverrides, DatabaseType } from '@appweaver/common';
import { postgresSchema } from '../../../database/utils/schema-util';

describe('schema-util', () => {
  afterEach(() => {
    delete configOverrides.DATABASE_URL;
  });

  describe('postgresSchema', () => {
    test('reads the schema parameter of a PostgreSQL URL', () => {
      configOverrides.DATABASE_URL = 'postgresql://u:p@h:5432/db?schema=geo';
      expect(postgresSchema(DatabaseType.PostgreSQL)).toBe('geo');
      expect(postgresSchema(DatabaseType.MySQL)).toBeUndefined();

      configOverrides.DATABASE_URL = 'postgresql://u:p@h:5432/db';
      expect(postgresSchema(DatabaseType.PostgreSQL)).toBeUndefined();

      configOverrides.DATABASE_URL = 'not a url';
      expect(postgresSchema(DatabaseType.PostgreSQL)).toBeUndefined();
    });
  });
});
