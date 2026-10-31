import { createModel } from '@appweaver/data';

/** The totals of the transactions of one UTC day, the amounts in cents. */
export default createModel({
  name: 'DailyReport',
  scalars: {
    date: {
      type: 'string',
      unique: true,
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      maxLength: 10
    },
    transactions: {
      type: 'int'
    },
    income: {
      type: 'int'
    },
    expenses: {
      type: 'int'
    },
    net: {
      type: 'int'
    },
    // The net amount of every category
    categories: {
      type: 'json',
      default: {}
    }
  }
});
