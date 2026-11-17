import { FormatRegistry, Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { validatePayload } from '../../utils/validate';

describe('validate', () => {
  describe('validatePayload', () => {
    test('returns a valid value and refuses an invalid one', () => {
      const schema = Type.Object({ id: Type.Integer() });

      expect(validatePayload(schema, { id: 1 })).toEqual({ id: 1 });
      expect(() => validatePayload(schema, { id: 'a' })).toThrow(
        expect.objectContaining({
          code: ErrorCode.RealtimePayloadInvalid,
          details: {
            errors: [expect.objectContaining({ path: '/id' })]
          }
        })
      );
    });

    test.each([
      ['date-time', '2026-11-17T10:30:00.000Z', '2026-11-17'],
      ['date', '2024-02-29', '2023-02-29'],
      ['time', '10:30:00+01:00', '24:00:00Z'],
      ['email', 'user@example.com', 'user@'],
      ['uri', 'https://example.com/a?b=1', 'example.com'],
      ['uuid', '019a8f5e-2b1c-7d3e-8f4a-5b6c7d8e9f01', '019a8f5e-2b1c'],
      ['ipv4', '192.168.0.1', '256.1.1.1'],
      ['ipv6', '2001:db8::1', '2001:db8:::1'],
      ['hostname', 'api.example.com', '-example.com']
    ])('checks the %s format', (format, valid, invalid) => {
      const schema = Type.Object({ value: Type.String({ format }) });

      expect(validatePayload(schema, { value: valid })).toEqual({
        value: valid
      });
      expect(() => validatePayload(schema, { value: invalid })).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
    });

    test('keeps a format the application registered', () => {
      FormatRegistry.Set('hostname', (value) => value === 'local');
      try {
        const schema = Type.String({ format: 'hostname' });

        expect(validatePayload(schema, 'local')).toBe('local');
        expect(() => validatePayload(schema, 'example.com')).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
        );
      } finally {
        FormatRegistry.Delete('hostname');
      }
    });
  });
});
