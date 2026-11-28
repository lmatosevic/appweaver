import { exportConfig } from '../../export/export-config';
import { configOverrides } from '@appweaver/common';
import { escapeFormula, toCsv } from '../../utils/export-util';

const DELIMITER = exportConfig.CSV_DELIMITER;

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

    test('joins the arrays of plain values with the join delimiter', () => {
      const csv = toCsv([{ tags: ['a', 'b'], scores: [1, 2] }]);

      expect(csv.trim()).toBe(`a,b${DELIMITER}1,2`);
    });

    test('serializes the arrays of objects as JSON', () => {
      const csv = toCsv([{ items: [{ id: 1 }] }]);

      expect(csv.trim()).toBe('"[{""id"":1}]"');
    });

    test('escapes the text cells starting like a formula', () => {
      const csv = toCsv([{ a: '=HYPERLINK("x")', b: '@SUM(A1)', c: ['+cmd'] }]);

      expect(csv.trim()).toBe(
        `"'=HYPERLINK(""x"")"${DELIMITER}'@SUM(A1)${DELIMITER}'+cmd`
      );
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

  describe('escapeFormula', () => {
    afterEach(() => {
      delete configOverrides.EXPORT_CSV_ESCAPE_FORMULAS;
    });

    test('prefixes the text a spreadsheet would run as a formula', () => {
      for (const value of [
        '=1+1',
        '+cmd|x',
        '-2+3+cmd',
        '@SUM(A1)',
        '\tx',
        '\rx'
      ]) {
        expect(escapeFormula(value)).toBe(`'${value}`);
      }
    });

    test('keeps signed numeric text and plain text', () => {
      for (const value of [
        '+385 91 123 4567',
        '-12.5',
        '+1 (555) 010-9999',
        'Title',
        ''
      ]) {
        expect(escapeFormula(value)).toBe(value);
      }
    });

    test('keeps every value with the escaping off', () => {
      configOverrides.EXPORT_CSV_ESCAPE_FORMULAS = false;

      expect(escapeFormula('=1+1')).toBe('=1+1');
    });
  });
});
