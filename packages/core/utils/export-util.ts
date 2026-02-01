import { stringify } from 'csv-stringify/sync';
import { config, isArray } from '@appweaver/common';

export function toCsv(data: any[], header: boolean = false): string {
  return stringify(Object.values(data), {
    delimiter: config.EXPORT_CSV_DELIMITER,
    cast: {
      date: (value: Date) => value.toISOString(),
      object: (value: any) =>
        isArray(value) &&
        ['string', 'number', 'boolean'].includes(typeof value[0])
          ? value.join(config.EXPORT_CSV_JOIN_DELIMITER)
          : JSON.stringify(value)
    },
    header
  });
}
