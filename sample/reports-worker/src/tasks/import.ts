import fs from 'node:fs';
import { parseTransactions } from '@/features/import/csv';
import { importTransactions } from '@/features/import/import-transactions';

const usage = 'Usage: weaver run src/tasks/import.ts <file.csv>';

/** Imports the transactions of a CSV file, exiting with 1 when a line is invalid. */
export default async function (args: string[]): Promise<number> {
  const [file] = args;
  if (!file) {
    console.error(usage);
    return 1;
  }
  if (!fs.existsSync(file)) {
    console.error(`No file ${file}`);
    return 1;
  }

  const { rows, errors } = parseTransactions(fs.readFileSync(file, 'utf8'));
  errors.forEach((error) => console.error(error));

  const { imported, skipped, rebuilt } = await importTransactions(rows);
  console.log(
    `Imported ${imported} transactions, skipped ${skipped} imported before`
  );
  if (rebuilt.length > 0) {
    console.log(`Reports built again: ${rebuilt.join(', ')}`);
  }
  return errors.length > 0 ? 1 : 0;
}
