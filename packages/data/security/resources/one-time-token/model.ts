import { securityStoreConfig } from '@appweaver/core';
import { createModel } from '../../../factory/create-model';
import { keepsTable } from '../../../database/database-config';

// The database store is the one `auto` selects with a database
const shouldCreateModel =
  ['auto', 'database'].includes(securityStoreConfig.PROVIDER) ||
  keepsTable('OneTimeToken');

export default shouldCreateModel
  ? createModel({
      name: 'OneTimeToken',
      // Tokens are only created and deleted, never updated
      audit: {
        updatedAt: false,
        createdById: false
      },
      scalars: {
        tokenHash: {
          type: 'string',
          maxLength: 128,
          unique: true
        },
        purpose: {
          type: 'string',
          maxLength: 64
        },
        data: {
          type: 'json'
        },
        expiresAt: {
          type: 'dateTime'
        }
      },
      // Deleting the expired tokens filters by the expiration
      index: [['expiresAt']]
    })
  : undefined;
