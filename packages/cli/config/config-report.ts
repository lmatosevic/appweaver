import {
  ConfigSectionDefinition,
  configSource,
  ConfigSource
} from '@appweaver/common';

/** A key of the config, with its value and where the value comes from. */
export type ConfigRow = {
  key: string;
  value: unknown;
  source: ConfigSource;
};

/** The keys whose values are hidden, i.e. passwords, secrets and private keys. */
const SECRET_KEY = /(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|CREDENTIALS|API_KEY)$/;

/**
 * Reads every key of the config sections, hiding the secret values.
 *
 * @param {Iterable<ConfigSectionDefinition>} sections - The registered config sections.
 * @return {{ rows: ConfigRow[]; errors: string[] }} The keys sorted by name, and the error of every section that
 * fails to parse.
 */
export function readConfigReport(sections: Iterable<ConfigSectionDefinition>): {
  rows: ConfigRow[];
  errors: string[];
} {
  const rows: ConfigRow[] = [];
  const errors: string[] = [];

  for (const { prefix, schema, values } of sections) {
    for (const [shortKey, property] of Object.entries(schema.properties)) {
      const key = prefix + shortKey;
      let value: unknown;
      try {
        value = values[shortKey];
      } catch (error) {
        const message = (error as Error).message;
        if (!errors.includes(message)) {
          errors.push(message);
        }
        continue;
      }
      const secret =
        (property as { secret?: boolean }).secret === true ||
        SECRET_KEY.test(key);
      rows.push({
        key,
        value: secret && value !== undefined ? '********' : value,
        source: configSource(key)
      });
    }
  }

  return { rows: rows.sort((a, b) => a.key.localeCompare(b.key)), errors };
}

/**
 * Formats the rows as an aligned table.
 *
 * @param {ConfigRow[]} rows - The rows.
 * @return {string[]} The lines of the table.
 */
export function formatConfigRows(rows: ConfigRow[]): string[] {
  const width = Math.max(0, ...rows.map((row) => row.key.length));
  return rows.map(
    (row) =>
      `${row.key.padEnd(width)}  ${row.source.padEnd(8)}  ${
        row.value === undefined ? '' : JSON.stringify(row.value)
      }`
  );
}
