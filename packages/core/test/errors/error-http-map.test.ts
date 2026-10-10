import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode } from '@appweaver/common';
import {
  defineErrors,
  errorCodeName,
  errorCodes,
  errorHttpMap,
  errorHttpMapping
} from '../../errors/error-http-map';

describe('error-http-map', () => {
  describe('errorHttpMap', () => {
    test('maps every framework error code to an error status', () => {
      for (const code of Object.values(ErrorCode)) {
        const mapping = errorHttpMap[code];

        expect(mapping.title).toBeTruthy();
        expect(mapping.status).toBeGreaterThanOrEqual(400);
        expect(mapping.status).toBeLessThan(600);
      }
    });
  });

  describe('errorHttpMap documentation', () => {
    const docPath = path.join(
      __dirname,
      '../../../../skill/references/errors.md'
    );

    test('lists every error code with its status and title in errors.md', () => {
      const documented = fs
        .readFileSync(docPath, 'utf8')
        .split('\n')
        .map((line) =>
          line.match(/^\| `([A-Z0-9_]+)` +\| (\d{3}) +\| (.+?) +\|$/)
        )
        .filter((match) => match !== null)
        .map(([, code, status, title]) => `${code} | ${status} | ${title}`);

      const expected = Object.values(ErrorCode).map(
        (code) =>
          `${code} | ${errorHttpMap[code].status} | ${errorHttpMap[code].title}`
      );

      // On a mismatch, the table of the "Error codes" section is out of date
      expect(documented).toEqual(expected);
    });
  });

  describe('defineErrors', () => {
    test('derives the codes from the names and registers them', () => {
      const codes = defineErrors({
        MapTestOutOfStock: { status: 409, title: 'Out of stock' },
        MapTestOAuth2Failed: { status: 400, title: 'Failed' }
      });

      expect(codes.MapTestOutOfStock).toBe('MAP_TEST_OUT_OF_STOCK');
      expect(codes.MapTestOAuth2Failed).toBe('MAP_TEST_O_AUTH2_FAILED');
      expect(errorHttpMapping('MAP_TEST_OUT_OF_STOCK')).toEqual({
        status: 409,
        title: 'Out of stock'
      });
    });

    test('types the derived code as a literal', () => {
      const { MapTestTyped } = defineErrors({
        MapTestTyped: { status: 400, title: 'Typed' }
      });

      const code: 'MAP_TEST_TYPED' = MapTestTyped;

      expect(code).toBe('MAP_TEST_TYPED');
    });

    test('takes the code a mapping gives', () => {
      const { MapTestCustom } = defineErrors({
        MapTestCustom: { status: 402, title: 'Custom', code: 'MAP_CUSTOM' }
      });

      expect(MapTestCustom).toBe('MAP_CUSTOM');
      expect(errorHttpMapping('MAP_CUSTOM')?.status).toBe(402);
    });

    test('accepts the same mapping registered again', () => {
      const mapping = { MapTestRepeated: { status: 402, title: 'Payment' } };

      defineErrors(mapping);

      expect(() => defineErrors(mapping)).not.toThrow();
    });

    test('rejects a name that is not in PascalCase', () => {
      expect(() =>
        defineErrors({ MAP_TEST_SCREAMING: { status: 400, title: 'No' } })
      ).toThrow("Error name 'MAP_TEST_SCREAMING' must be in PascalCase");
    });

    test('rejects a name or a code of the framework', () => {
      expect(() =>
        defineErrors({ ResourceNotFound: { status: 404, title: 'Missing' } })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
      expect(() =>
        defineErrors({
          MapTestMissing: {
            status: 404,
            title: 'Missing',
            code: ErrorCode.ResourceNotFound
          }
        })
      ).toThrow("with the code 'RESOURCE_NOT_FOUND' is already defined");
    });

    test('rejects a code registered with another mapping', () => {
      defineErrors({ MapTestChanged: { status: 409, title: 'Changed' } });

      expect(() =>
        defineErrors({ MapTestChanged: { status: 400, title: 'Changed' } })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
    });

    test('rejects a name registered with another code', () => {
      defineErrors({ MapTestNamed: { status: 409, title: 'Named' } });

      expect(() =>
        defineErrors({
          MapTestNamed: { status: 409, title: 'Named', code: 'MAP_OTHER' }
        })
      ).toThrow(
        "Error 'MapTestNamed' with the code 'MAP_OTHER' is already defined"
      );
    });

    test('rejects a status outside the error range', () => {
      expect(() =>
        defineErrors({ MapTestOk: { status: 200, title: 'Ok' } })
      ).toThrow('must map to an HTTP status from 400 to 599');
    });
  });

  describe('errorHttpMapping', () => {
    test('returns undefined for an unregistered code', () => {
      expect(errorHttpMapping('MAP_TEST_UNREGISTERED')).toBeUndefined();
    });
  });

  describe('errorCodes', () => {
    test('lists the framework and the application codes', () => {
      defineErrors({ MapTestListed: { status: 400, title: 'Listed' } });

      expect(errorCodes()).toEqual(
        expect.arrayContaining([ErrorCode.InternalError, 'MAP_TEST_LISTED'])
      );
    });
  });

  describe('errorCodeName', () => {
    test('returns the name of a framework and an application code', () => {
      defineErrors({ MapTestNameOf: { status: 400, title: 'Name' } });

      expect(errorCodeName(ErrorCode.OAuth2ProviderError)).toBe(
        'OAuth2ProviderError'
      );
      expect(errorCodeName('MAP_TEST_NAME_OF')).toBe('MapTestNameOf');
      expect(errorCodeName('MAP_TEST_UNKNOWN')).toBeUndefined();
    });
  });
});
