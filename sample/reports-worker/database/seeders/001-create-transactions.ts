import { Prisma } from '@db/client/client';
import db from '@db/client';
import { buildMissingReports } from '@/features/reports/daily-report';
import { daysBefore, toDate } from '@/features/reports/dates';

const expenses = [
  { category: 'Rent', min: 120_000, max: 120_000, chance: 0 },
  { category: 'Groceries', min: 1_500, max: 12_000, chance: 0.8 },
  { category: 'Transport', min: 250, max: 4_500, chance: 0.6 },
  { category: 'Restaurants', min: 1_800, max: 9_500, chance: 0.35 },
  { category: 'Utilities', min: 4_000, max: 15_000, chance: 0.05 }
];

/** A pseudo-random generator, so every seed gives the same ledger. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The last 45 days of a household ledger: a salary and the rent on the first of the month, everyday expenses, the
 * occasional freelance income, then the reports of the past days.
 */
export async function createTransactions(): Promise<void> {
  const next = random(45);
  const between = (min: number, max: number) =>
    min + Math.round(next() * (max - min));
  const data: Prisma.TransactionCreateManyInput[] = [];

  for (let days = 44; days >= 0; days--) {
    const day = daysBefore(
      new Date(`${toDate(new Date())}T00:00:00.000Z`),
      days
    );
    const date = toDate(day);
    const at = (hour: number) =>
      new Date(day.getTime() + hour * 3_600_000 + between(0, 3_599_999));
    let count = 0;
    const add = (
      kind: 'Income' | 'Expense',
      category: string,
      amount: number,
      hour: number
    ) =>
      data.push({
        reference: `SEED-${date}-${++count}`,
        kind,
        category,
        amount,
        description: `${category} (demo)`,
        occurredAt: at(hour)
      });

    if (day.getUTCDate() === 1) {
      add('Income', 'Salary', 420_000, 8);
      add('Expense', 'Rent', 120_000, 9);
    }
    if (next() < 0.1) {
      add('Income', 'Freelance', between(20_000, 80_000), 14);
    }
    for (const { category, min, max, chance } of expenses) {
      if (next() < chance) {
        add('Expense', category, between(min, max), between(10, 20));
      }
    }
  }

  await db.transaction.createMany({ data });
  await buildMissingReports(
    toDate(daysBefore(new Date(), 44)),
    toDate(new Date())
  );
}
