jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  return {
    __esModule: true,
    ...actual,
    requireModule: jest.fn()
  };
});

import * as common from '@appweaver/common';
import { createClient, logQuery } from '../../database/create-client';

describe('create-client', () => {
  const overrides = (common as any).configOverrides as Record<string, unknown>;
  const PrismaPg = jest.fn();
  const PrismaClient = jest.fn(() => ({ $on: jest.fn() }));

  beforeEach(() => {
    PrismaPg.mockClear();
    (common.requireModule as jest.Mock).mockImplementation((name: string) => ({
      value: name === '@prisma/adapter-pg' ? { PrismaPg } : { PrismaClient }
    }));
    overrides.DATABASE_TYPE = common.DatabaseType.PostgreSQL;
  });

  afterEach(() => {
    for (const key of Object.keys(overrides)) {
      delete overrides[key];
    }
  });

  describe('createClient', () => {
    test('passes the schema of the PostgreSQL URL to the adapter', () => {
      overrides.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/shop?schema=webshop';

      createClient();

      expect(PrismaPg).toHaveBeenCalledWith(
        { connectionString: overrides.DATABASE_URL },
        { schema: 'webshop' }
      );
    });

    test('leaves the PostgreSQL schema to the adapter default without one', () => {
      overrides.DATABASE_URL = 'postgresql://user:pass@localhost:5432/shop';

      createClient();

      expect(PrismaPg).toHaveBeenCalledWith(
        { connectionString: overrides.DATABASE_URL },
        { schema: undefined }
      );
    });
  });

  describe('logQuery', () => {
    const logger = common.createLogger('database');
    const query = (duration: number) =>
      ({ query: 'SELECT 1', params: '[]', duration, target: 'db' }) as any;

    test('warns about a query slower than the threshold, without its parameters', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      overrides.DATABASE_SLOW_QUERY_THRESHOLD = 100;

      logQuery(query(150));

      expect(warn).toHaveBeenCalledWith(
        { query: 'SELECT 1', duration: 150, threshold: 100 },
        'Slow database query'
      );
      warn.mockRestore();
    });

    test('logs a fast query only when the queries are logged', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      const debug = jest.spyOn(logger, 'debug').mockImplementation();
      overrides.DATABASE_SLOW_QUERY_THRESHOLD = 100;

      logQuery(query(50));
      expect(debug).not.toHaveBeenCalled();

      overrides.DATABASE_LOG_EVENTS = ['query'];
      logQuery(query(50));
      expect(debug).toHaveBeenCalledWith(query(50), 'Prisma query');
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
      debug.mockRestore();
    });

    test('emits the query events of a slow query threshold', () => {
      const $on = jest.fn();
      PrismaClient.mockImplementationOnce(() => ({ $on }));
      overrides.DATABASE_SLOW_QUERY_THRESHOLD = 100;
      overrides.DATABASE_URL = 'postgresql://user:pass@localhost:5432/shop';

      createClient();

      expect($on).toHaveBeenCalledWith('query', logQuery);
    });
  });
});
