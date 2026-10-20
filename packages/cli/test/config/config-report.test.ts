import { Type } from '@sinclair/typebox';
import {
  configOverrides,
  ConfigurationError,
  ErrorCode
} from '@appweaver/common';
import { formatConfigRows, readConfigReport } from '../../config/config-report';

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
});
