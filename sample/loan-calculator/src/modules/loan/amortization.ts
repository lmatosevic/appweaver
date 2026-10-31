import { ApplicationError } from '@appweaver/common';
import { LoanErrors } from './errors';

/** The terms of a loan, the amount in the main unit of its currency. */
export type LoanTerms = {
  principal: number;
  /** The yearly interest rate in percent. */
  annualRate: number;
  months: number;
};

/** A monthly installment, the amounts in cents. */
export type Installment = {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

/** The repayment of a loan, the amounts in cents. */
export type Schedule = {
  terms: LoanTerms;
  /** The regular monthly payment, the last one may differ by the rounding. */
  payment: number;
  totalPaid: number;
  totalInterest: number;
  installments: Installment[];
};

/**
 * Calculates the monthly payment of a loan repaid in equal installments.
 *
 * @param {LoanTerms} terms - The terms of the loan.
 * @return {number} The payment in cents.
 * @throws {ApplicationError} When the terms are invalid.
 */
export function monthlyPayment(terms: LoanTerms): number {
  validateTerms(terms);

  const principal = Math.round(terms.principal * 100);
  const rate = terms.annualRate / 100 / 12;
  if (rate === 0) {
    return Math.ceil(principal / terms.months);
  }

  return Math.round((principal * rate) / (1 - (1 + rate) ** -terms.months));
}

/**
 * Calculates the amortization schedule of a loan: every month pays the interest on the remaining balance, and the
 * rest of the payment repays the principal. The last installment repays what the rounding left.
 *
 * @param {LoanTerms} terms - The terms of the loan.
 * @return {Schedule} The schedule, the amounts in cents.
 * @throws {ApplicationError} When the terms are invalid.
 */
export function amortize(terms: LoanTerms): Schedule {
  const payment = monthlyPayment(terms);
  const rate = terms.annualRate / 100 / 12;

  let balance = Math.round(terms.principal * 100);
  const installments: Installment[] = [];
  for (let month = 1; month <= terms.months && balance > 0; month++) {
    const interest = Math.round(balance * rate);
    const principal =
      month === terms.months ? balance : Math.min(payment - interest, balance);
    balance -= principal;
    installments.push({
      month,
      payment: principal + interest,
      principal,
      interest,
      balance
    });
  }

  const totalPaid = installments.reduce((sum, item) => sum + item.payment, 0);
  return {
    terms,
    payment,
    totalPaid,
    totalInterest: totalPaid - Math.round(terms.principal * 100),
    installments
  };
}

function validateTerms({ principal, annualRate, months }: LoanTerms): void {
  const errors: string[] = [];
  if (!Number.isFinite(principal) || principal <= 0) {
    errors.push('the principal must be a positive amount');
  }
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
    errors.push('the rate must be between 0 and 100 percent');
  }
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    errors.push('the term must be between 1 and 600 months');
  }

  if (errors.length > 0) {
    throw new ApplicationError(
      LoanErrors.InvalidTerms,
      `Invalid loan terms: ${errors.join(', ')}`,
      { errors }
    );
  }
}
