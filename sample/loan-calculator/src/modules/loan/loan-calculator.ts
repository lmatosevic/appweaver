import { createLogger } from '@appweaver/common';
import { CacheService, inject } from '@appweaver/core';
import { amortize, LoanTerms, Schedule } from './amortization';
import { loanConfig } from './config';

const logger = createLogger('loan');

/** The schedule of a rate, compared to the others. */
export type RateComparison = {
  annualRate: number;
  payment: number;
  totalInterest: number;
};

/**
 * Calculates the loans with the defaults of the loan config, keeping the schedules in the cache, so the same terms
 * are calculated once.
 */
export class LoanCalculator {
  /**
   * Calculates the amortization schedule of a loan.
   *
   * @param {Partial<LoanTerms> & { principal: number }} terms - The terms, the rate and the term by default the ones
   * of the config.
   * @return {Promise<Schedule>} The schedule, the amounts in cents.
   */
  public async calculate(
    terms: Partial<LoanTerms> & { principal: number }
  ): Promise<Schedule> {
    const resolved: LoanTerms = {
      principal: terms.principal,
      annualRate: terms.annualRate ?? loanConfig.DEFAULT_RATE,
      months: terms.months ?? loanConfig.DEFAULT_TERM_MONTHS
    };

    const cache = inject(CacheService);
    const key = `loan:${resolved.principal}:${resolved.annualRate}:${resolved.months}`;
    const cached = await cache.getCachedValue<Schedule>(key);
    if (cached) {
      logger.debug({ key }, 'Schedule read from the cache');
      return cached;
    }

    const schedule = amortize(resolved);
    await cache.addToCache(key, schedule, loanConfig.CACHE_TTL);
    return schedule;
  }

  /**
   * Compares the payment and the total interest of a loan at several rates.
   *
   * @param {number} principal - The amount borrowed.
   * @param {number} months - The term in months.
   * @param {number[]} rates - The yearly interest rates in percent.
   * @return {Promise<RateComparison[]>} The comparisons, from the lowest total interest.
   */
  public async compare(
    principal: number,
    months: number,
    rates: number[]
  ): Promise<RateComparison[]> {
    const schedules = await Promise.all(
      rates.map((annualRate) =>
        this.calculate({ principal, annualRate, months })
      )
    );
    return schedules
      .map(({ terms, payment, totalInterest }) => ({
        annualRate: terms.annualRate,
        payment,
        totalInterest
      }))
      .sort((a, b) => a.totalInterest - b.totalInterest);
  }
}
