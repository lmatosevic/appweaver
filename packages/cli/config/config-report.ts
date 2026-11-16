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
        value:
          secret && value !== undefined ? '********' : redactUrlPassword(value),
        source: configSource(key)
      });
    }
  }

  return { rows: rows.sort((a, b) => a.key.localeCompare(b.key)), errors };
}

/**
 * Hides the password of a connection URL, i.e. `postgresql://user:********@host/db`, or of its `password` parameter,
 * i.e. `sqlserver://host;password=********`.
 *
 * @param {unknown} value - The value of a key.
 * @return {unknown} The value, its password hidden when it is a URL with one.
 */
export function redactUrlPassword(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  // The password of user:password@, ending at the last @ before the host
  return value
    .replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/?#@]*:)[^/?#]*@/i, '$1********@')
    .replace(/^([a-z][a-z0-9+.-]*:.*[;?&]password=)[^;&]*/i, '$1********');
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
