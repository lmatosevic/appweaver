import { stringify } from 'csv-stringify/sync';
import { isArray, isBoolean, isNumber, isString } from '@appweaver/common';
import { exportConfig } from '../export/export-config';

/**
 * Converts an array of data into a CSV-formatted string.
 *
 * @param {Object[]} data - The array of data to be converted into CSV format.
 * @param {boolean} [header=false] - Whether to include a header row in the generated CSV.
 * @return {string} The CSV-formatted string representation of the input data.
 */
export function toCsv(data: any[], header: boolean = false): string {
  return stringify(Object.values(data), {
    delimiter: exportConfig.CSV_DELIMITER,
    cast: {
      date: (value: Date) => value.toISOString(),
      string: (value: string) => escapeFormula(value),
      object: (value: any) =>
        escapeFormula(
          isArray(value) &&
            value.every(
              (item) => isString(item) || isNumber(item) || isBoolean(item)
            )
            ? value.join(exportConfig.CSV_JOIN_DELIMITER)
            : JSON.stringify(value)
        )
    },
    header
  });
}

// The first characters a spreadsheet reads as the start of a formula
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// A signed number, a phone number or a date written with digits and separators only, which no spreadsheet runs
const NUMERIC_TEXT = /^[+-]?[\d\s.,()/-]*\d[\d\s.,()/-]*$/;

/**
 * Prefixes with `'` a cell a spreadsheet would run as a formula (CSV injection), unless `export.csvEscapeFormulas` is
 * off or the text is only a signed number.
 *
 * @param {string} value - The text of the cell.
 * @return {string} The text, prefixed when it starts like a formula.
 */
export function escapeFormula(value: string): string {
  if (
    !exportConfig.CSV_ESCAPE_FORMULAS ||
    !FORMULA_PREFIX.test(value) ||
    NUMERIC_TEXT.test(value)
  ) {
    return value;
  }
  return `'${value}`;
}
