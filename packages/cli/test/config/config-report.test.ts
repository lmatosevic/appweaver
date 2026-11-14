import { Type } from '@sinclair/typebox';
import {
  configOverrides,
  ConfigurationError,
  ErrorCode
} from '@appweaver/common';
import {
  formatConfigRows,
  readConfigReport,
  redactUrlPassword
} from '../../config/config-report';

describe('config-report', () => {
  afterEach(() => {
    delete configOverrides.REPORT_PORT;
  });

  describe('readConfigReport', () => {
    test('reads every key with its source, hiding the secrets', () => {
      configOverrides.REPORT_PORT = 8080;

      const { rows, errors } = readConfigReport([
        {
          section: 'report',
          prefix: 'REPORT_',
          schema: Type.Object({
            PORT: Type.Integer(),
            PASSWORD: Type.String(),
            TOKEN_SALT: Type.String({ secret: true })
          }),
          values: { PORT: 8080, PASSWORD: 'p4ss', TOKEN_SALT: undefined }
        }
      ]);

      expect(errors).toEqual([]);
      expect(rows).toEqual([
        { key: 'REPORT_PASSWORD', value: '********', source: 'default' },
        { key: 'REPORT_PORT', value: 8080, source: 'override' },
        { key: 'REPORT_TOKEN_SALT', value: undefined, source: 'default' }
      ]);
    });

    test('hides the password of a connection URL', () => {
      const { rows } = readConfigReport([
        {
          section: 'store',
          prefix: 'STORE_',
          schema: Type.Object({ URL: Type.String() }),
          values: { URL: 'postgresql://app:s3cret@localhost:5432/shop' }
        }
      ]);

      expect(rows[0].value).toBe(
        'postgresql://app:********@localhost:5432/shop'
      );
    });

    test('collects the error of a section failing to parse', () => {
      const values = {};
      Object.defineProperty(values, 'URL', {
        enumerable: true,
        get: () => {
          throw new ConfigurationError(
            ErrorCode.ConfigurationInvalid,
            'Invalid config of section "broken"'
          );
        }
      });

      const { rows, errors } = readConfigReport([
        {
          section: 'broken',
          prefix: 'BROKEN_',
          schema: Type.Object({ URL: Type.String() }),
          values
        }
      ]);

      expect(rows).toEqual([]);
      expect(errors).toEqual(['Invalid config of section "broken"']);
    });
  });

  describe('formatConfigRows', () => {
    test('aligns the keys and the sources', () => {
      expect(
        formatConfigRows([
          { key: 'A', value: 1, source: 'env' },
          { key: 'LONGER', value: undefined, source: 'default' }
        ])
      ).toEqual(['A       env       1', 'LONGER  default   ']);
    });
  });

  describe('redactUrlPassword', () => {
    test.each([
      [
        'postgresql://app:s3cret@localhost:5432/shop',
        'postgresql://app:********@localhost:5432/shop'
      ],
      [
        'mysql://app:p@ss@db/shop?ssl=true',
        'mysql://app:********@db/shop?ssl=true'
      ],
      [
        'redis://:s3cret@localhost:6379/0',
        'redis://:********@localhost:6379/0'
      ],
      [
        'sqlserver://db:1433;database=shop;user=sa;password=s3cret;encrypt=true',
        'sqlserver://db:1433;database=shop;user=sa;password=********;encrypt=true'
      ]
    ])('hides the password of %s', (url, redacted) => {
      expect(redactUrlPassword(url)).toBe(redacted);
    });

    test.each([
      'redis://localhost:6379/0',
      'mysql://app@db/shop',
      'file:./data/shop.db',
      'http://localhost:3000/a:b@c'
    ])('keeps %s without a password', (url) => {
      expect(redactUrlPassword(url)).toBe(url);
    });

    test('keeps the values that are not strings', () => {
      expect(redactUrlPassword(8080)).toBe(8080);
      expect(redactUrlPassword(undefined)).toBeUndefined();
    });
  });
});
