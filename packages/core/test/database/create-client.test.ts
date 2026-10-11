jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {};
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    requireModule: jest.fn(),
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

import * as common from '@appweaver/common';
import { createClient } from '../../database/create-client';

describe('create-client', () => {
  const overrides = (common as any).configOverrides as Record<string, unknown>;
  const PrismaPg = jest.fn();
  const PrismaClient = jest.fn(() => ({ $on: jest.fn() }));

  beforeEach(() => {
    PrismaPg.mockClear();
    (common.requireModule as jest.Mock).mockImplementation((name: string) => ({
      value: name === '@prisma/adapter-pg' ? { PrismaPg } : { PrismaClient }
    }));
    overrides.DATABASE_TYPE = common.DatabaseType.PostgresSQL;
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
});
