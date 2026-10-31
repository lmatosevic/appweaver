import { createModel } from '@appweaver/data';

/** A booking of the ledger, its amount in cents. */
export default createModel({
  name: 'Transaction',
  scalars: {
    // The id of the booking in the system it is imported from, imported once
    reference: {
      type: 'string',
      unique: true,
      maxLength: 64
    },
    kind: {
      type: 'enum',
      values: ['Income', 'Expense']
    },
    category: {
      type: 'string',
      maxLength: 50
    },
    amount: {
      type: 'int',
      minimum: 1
    },
    description: {
      type: 'string',
      maxLength: 255,
      required: false
    },
    occurredAt: {
      type: 'dateTime'
    }
  },
  index: ['occurredAt']
});
