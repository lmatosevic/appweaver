import { config } from '@appweaver/common';
import { toCsv } from '../../utils/export-util';

const DELIMITER = config.EXPORT_CSV_DELIMITER;

describe('export-util', () => {
  describe('toCsv', () => {
    test('converts records into delimited rows', () => {
      const csv = toCsv([
        { id: 1, title: 'First' },
        { id: 2, title: 'Second' }
      ]);

      expect(csv).toBe(`1${DELIMITER}First\n2${DELIMITER}Second\n`);
    });

    test('adds a header row when requested', () => {
      const csv = toCsv([{ id: 1, title: 'First' }], true);

      expect(csv.split('\n')[0]).toBe(`id${DELIMITER}title`);
    });

    test('returns an empty string for no records', () => {
      expect(toCsv([])).toBe('');
    });

    test('formats dates as ISO strings', () => {
      const date = new Date('2026-03-01T10:20:30.000Z');

      const csv = toCsv([{ createdAt: date }]);

      expect(csv.trim()).toBe(date.toISOString());
    });

    test('serializes nested objects as JSON', () => {
      const csv = toCsv([{ metadata: { views: 3 } }]);

      expect(csv.trim()).toBe('"{""views"":3}"');
    });

    test('serializes array values', () => {
      const csv = toCsv([{ tags: ['a', 'b'] }]);

      expect(csv.trim()).toContain('a');
      expect(csv.trim()).toContain('b');
    });

    test('quotes values containing the delimiter', () => {
      const csv = toCsv([{ title: `First${DELIMITER}Second` }]);

      expect(csv.trim()).toBe(`"First${DELIMITER}Second"`);
    });

    test('keeps null and undefined values empty', () => {
      const csv = toCsv([{ a: null, b: undefined, c: 'value' }]);

      expect(csv.trim()).toBe(`${DELIMITER}${DELIMITER}value`);
    });

    test('writes boolean and numeric values as is', () => {
      const csv = toCsv([{ enabled: true, views: 42 }]);

      expect(csv.trim()).toBe(`1${DELIMITER}42`);
    });
  });
});
