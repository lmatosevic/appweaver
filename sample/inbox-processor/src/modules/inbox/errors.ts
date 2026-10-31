import { defineErrors } from '@appweaver/common';

export const InboxErrors = defineErrors({
  LineRejected: { status: 422, title: 'Line rejected' },
  EntryNotFailed: { status: 409, title: 'Entry has not failed' }
});
