import { defineErrors } from '@appweaver/common';

export const LoanErrors = defineErrors({
  InvalidTerms: { status: 400, title: 'Invalid loan terms' }
});
