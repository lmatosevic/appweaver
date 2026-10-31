/** Formats an amount in cents with two decimals and a sign for a negative one, i.e. `-1,250.00`. */
export function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Formats rows as a text table, the first row being the header and every column after the first aligned right. */
export function formatTable(rows: string[][]): string {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length))
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths[column])
            : cell.padStart(widths[column])
        )
        .join('  ')
    )
    .join('\n');
}
