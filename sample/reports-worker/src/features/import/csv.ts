/** A transaction read from a CSV row, its amount in cents. */
export type TransactionRow = {
  reference: string;
  occurredAt: Date;
  kind: 'Income' | 'Expense';
  category: string;
  amount: number;
  description: string | null;
};

const columns = [
  'reference',
  'occurredAt',
  'kind',
  'category',
  'amount',
  'description'
];

/**
 * Parses the transactions of a CSV file with the header `reference,occurredAt,kind,category,amount,description`, the
 * amount in the main unit (`12.50`). A value holding a comma is quoted, a quote inside it doubled.
 *
 * @param {string} content - The content of the file.
 * @return {{ rows: TransactionRow[]; errors: string[] }} The valid rows, and an error for every invalid line.
 */
export function parseTransactions(content: string): {
  rows: TransactionRow[];
  errors: string[];
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [header, ...records] = lines;
  if (header?.trim() !== columns.join(',')) {
    return { rows: [], errors: [`Expected the header ${columns.join(',')}`] };
  }

  const rows: TransactionRow[] = [];
  const errors: string[] = [];
  records.forEach((line, index) => {
    const lineNumber = index + 2;
    const values = splitLine(line);
    if (values.length !== columns.length) {
      errors.push(`Line ${lineNumber}: expected ${columns.length} values`);
      return;
    }

    const [reference, occurredAt, kind, category, amount, description] = values;
    const moment = new Date(occurredAt);
    const cents = Math.round(Number(amount) * 100);
    const problems = [
      !reference && 'no reference',
      Number.isNaN(moment.getTime()) && `invalid date ${occurredAt}`,
      kind !== 'Income' && kind !== 'Expense' && `invalid kind ${kind}`,
      !category && 'no category',
      !(cents > 0) && `invalid amount ${amount}`
    ].filter(Boolean);
    if (problems.length > 0) {
      errors.push(`Line ${lineNumber}: ${problems.join(', ')}`);
      return;
    }

    rows.push({
      reference,
      occurredAt: moment,
      kind: kind as TransactionRow['kind'],
      category,
      amount: cents,
      description: description || null
    });
  });

  return { rows, errors };
}

function splitLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}
