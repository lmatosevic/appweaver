import fs from 'node:fs';
import { createTask } from '@appweaver/core';
import { parseTransactions } from '@/features/import/csv';
import { importTransactions } from '@/features/import/import-transactions';

/**
 * Imports the transactions of a CSV file, exiting with 1 when a line is invalid, i.e.
 * `weaver run import fixtures/transactions.csv`.
 */
export default createTask({
  description: 'Imports the transactions of a CSV bank export.',
  arguments: {
    file: { required: true, description: 'The CSV file to import.' }
  },
  run: async ({ args }) => {
    if (!fs.existsSync(args.file)) {
      console.error(`No file ${args.file}`);
      return 1;
    }

    const { rows, errors } = parseTransactions(
      fs.readFileSync(args.file, 'utf8')
    );
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
});
