import { createModel } from '@appweaver/data';

/** A line of text submitted to the inbox, with the results of its processing. */
export default createModel({
  name: 'Entry',
  scalars: {
    text: {
      type: 'string',
      minLength: 1,
      maxLength: 2000
    },
    source: {
      type: 'enum',
      values: ['File', 'Api']
    },
    status: {
      type: 'enum',
      values: ['Pending', 'Processing', 'Processed', 'Failed'],
      default: 'Pending'
    },
    attempts: {
      type: 'int',
      default: 0
    },
    words: {
      type: 'int',
      required: false
    },
    checksum: {
      type: 'string',
      maxLength: 64,
      required: false
    },
    normalized: {
      type: 'string',
      maxLength: 2000,
      required: false
    },
    // The keywords found in the text, i.e. ["urgent", "invoice"]
    tags: {
      type: 'json',
      required: false
    },
    error: {
      type: 'string',
      maxLength: 500,
      required: false
    },
    processedAt: {
      type: 'dateTime',
      required: false
    }
  },
  index: ['status']
});
