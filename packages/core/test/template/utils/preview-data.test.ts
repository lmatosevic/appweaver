import { ErrorCode } from '@appweaver/common';
import { previewData } from '../../../template/utils/preview-data';

describe('preview-data', () => {
  describe('previewData', () => {
    test('keeps the plain parameters', () => {
      expect(previewData({ name: 'Ana', code: 'WS-1' })).toEqual({
        name: 'Ana',
        code: 'WS-1'
      });
    });

    test('converts the booleans, null and the numbers', () => {
      expect(
        previewData({
          paid: 'true',
          shipped: 'false',
          note: 'null',
          count: '3',
          total: '-12.5'
        })
      ).toEqual({
        paid: true,
        shipped: false,
        note: null,
        count: 3,
        total: -12.5
      });
    });

    test('keeps the numbers that would not print the same as strings', () => {
      expect(
        previewData({
          zip: '01000',
          phone: '+385911234567',
          id: '12345678901234567890',
          blank: ' ',
          exponent: '1e3'
        })
      ).toEqual({
        zip: '01000',
        phone: '+385911234567',
        id: '12345678901234567890',
        blank: ' ',
        exponent: '1e3'
      });
    });

    test('sets the nested values of the dotted names', () => {
      expect(
        previewData({
          'order.number': 'WS-1',
          'order.customer.name': 'Ana'
        })
      ).toEqual({ order: { number: 'WS-1', customer: { name: 'Ana' } } });
    });

    test('sets the list items of the numeric name parts', () => {
      expect(
        previewData({
          'items.0.name': 'Book',
          'items.0.price': '10',
          'items.1.name': 'Pen'
        })
      ).toEqual({ items: [{ name: 'Book', price: 10 }, { name: 'Pen' }] });
    });

    test('keeps the repeated parameters as a list', () => {
      expect(previewData({ tags: ['news', '2'] })).toEqual({
        tags: ['news', 2]
      });
    });

    test('merges the parameters over the JSON data', () => {
      expect(
        previewData({
          _data: JSON.stringify({ order: { number: 'WS-1', total: 5 } }),
          'order.number': 'WS-2'
        })
      ).toEqual({ order: { number: 'WS-2', total: 5 } });
    });

    test('rejects JSON data that is not an object', () => {
      for (const json of ['[1]', '"text"', '{ invalid', ['{}', '{}']]) {
        expect(() => previewData({ _data: json })).toThrow(
          expect.objectContaining({ code: ErrorCode.MalformedRequest })
        );
      }
    });

    test('ignores the names changing the prototype', () => {
      const data = previewData({
        '__proto__.polluted': 'yes',
        'constructor.prototype.polluted': 'yes',
        'a.__proto__': 'yes'
      });

      expect(data).toEqual({});
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    test('ignores the list indexes above the limit and the empty name parts', () => {
      expect(
        previewData({
          'items.0': 'a',
          'items.100000': 'b',
          'items.name': 'c',
          'a..b': 'd'
        })
      ).toEqual({ items: ['a'] });
    });

    test('writes a key above the list index limit as an object key', () => {
      expect(previewData({ 'codes.100000': 'x' })).toEqual({
        codes: { 100000: 'x' }
      });
    });
  });
});
