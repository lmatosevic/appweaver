import { stringify } from 'csv-stringify/sync';
import {
  config,
  isArray,
  isBoolean,
  isNumber,
  isString
} from '@appweaver/common';

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
