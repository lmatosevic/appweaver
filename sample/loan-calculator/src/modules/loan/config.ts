import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** The config of the loan module, read from config.loan and the LOAN_* variables. */
export const loanConfig = defineConfig('loan', {
  /** The yearly interest rate in percent of a calculation that gives none. Default: `5`. */
  DEFAULT_RATE: Type.Number({ default: 5, minimum: 0, maximum: 100 }),
  /** The term in months of a calculation that gives none. Default: `360` (30 years). */
  DEFAULT_TERM_MONTHS: Type.Integer({ default: 360, minimum: 1, maximum: 600 }),
  /** The ISO 4217 code of the currency the amounts are printed in. Default: `EUR`. */
  CURRENCY: Type.String({ default: 'EUR', pattern: '^[A-Z]{3}$' }),
  /** How long a calculated schedule stays cached, in milliseconds. Default: `600000` (10 min). */
  CACHE_TTL: Type.Integer({ default: 600_000, minimum: 0 })
});
