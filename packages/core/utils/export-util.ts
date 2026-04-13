import { stringify } from 'csv-stringify/sync';
import {
  config,
  isArray,
  isBoolean,
  isNumber,
  isString
} from '@appweaver/common';

/**
 * Converts an array of data into a CSV-formatted string.
 *
 * @param {Object[]} data - The array of data to be converted into CSV format.
 * @param {boolean} [header=false] - Whether to include a header row in the generated CSV.
 * @return {string} The CSV-formatted string representation of the input data.
 */
export function toCsv(data: any[], header: boolean = false): string {
  return stringify(Object.values(data), {
    delimiter: config.EXPORT_CSV_DELIMITER,
    cast: {
      date: (value: Date) => value.toISOString(),
      object: (value: any) =>
        isArray(value) &&
        (isString(value) || isNumber(value) || isBoolean(value))
          ? value.join(config.EXPORT_CSV_JOIN_DELIMITER)
          : JSON.stringify(value)
    },
    header
  });
}
