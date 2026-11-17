import { FormatRegistry, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { registerSchemaFormats, schemaFormats } from '../../utils';

describe('format-util', () => {
  describe('schemaFormats', () => {
    test.each([
      ['date', '2024-02-29', true],
      ['date', '2023-02-29', false],
      ['date', '2026-13-01', false],
      ['date', '2026-04-31', false],
      ['date', '2026-1-01', false],
      ['time', '10:30:00Z', true],
      ['time', '23:59:60.5-05:30', true],
      ['time', '10:30:00', false],
      ['time', '10:60:00Z', false],
      ['time', '10:30:00+24:00', false],
      ['date-time', '2026-11-17T10:30:00.000Z', true],
      ['date-time', '2026-11-17 10:30:00+02:00', true],
      ['date-time', '2026-11-17T10:30:00', false],
      ['date-time', '2026-11-17', false],
      ['email', 'first.last+tag@mail.example.com', true],
      ['email', 'user@localhost', false],
      ['email', 'user name@example.com', false],
      ['uri', 'https://example.com/path?q=1#top', true],
      ['uri', 'mailto:user@example.com', true],
      ['uri', '/relative/path', false],
      ['uri', 'https://exa mple.com', false],
      ['uuid', '019A8F5E-2B1C-7D3E-8F4A-5B6C7D8E9F01', true],
      ['uuid', 'urn:uuid:019a8f5e-2b1c-7d3e-8f4a-5b6c7d8e9f01', true],
      ['uuid', '019a8f5e2b1c7d3e8f4a5b6c7d8e9f01', false],
      ['ipv4', '10.0.0.255', true],
      ['ipv4', '10.0.0', false],
      ['ipv6', '::ffff:192.168.0.1', true],
      ['ipv6', '12345::', false],
      ['hostname', 'localhost', true],
      ['hostname', 'a_b.example.com', false],
      ['binary', '\u0000', true],
      ['password', 'secret', true]
    ])('checks the %s %j as %s', (format, value, valid) => {
      expect(schemaFormats[format](value)).toBe(valid);
    });
  });

  describe('registerSchemaFormats', () => {
    afterEach(() => {
      FormatRegistry.Clear();
    });

    test('registers every format for TypeBox', () => {
      FormatRegistry.Clear();
      const schema = Type.String({ format: 'date-time' });

      expect(Value.Check(schema, '2026-11-17T10:30:00Z')).toBe(false);
      registerSchemaFormats();

      expect(Object.keys(schemaFormats).every(FormatRegistry.Has)).toBe(true);
      expect(Value.Check(schema, '2026-11-17T10:30:00Z')).toBe(true);
      expect(Value.Check(schema, 'yesterday')).toBe(false);
    });

    test('keeps a format registered already', () => {
      const check = (value: string) => value.endsWith('.test');
      FormatRegistry.Set('email', check);

      registerSchemaFormats();

      expect(FormatRegistry.Get('email')).toBe(check);
    });
  });
});
