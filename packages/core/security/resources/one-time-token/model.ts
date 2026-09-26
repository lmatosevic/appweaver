import { config } from '@appweaver/common';
import { createModel } from '../../../factory';

const shouldCreateModel =
  config.SECURITY_STORE_PROVIDER ===
    '@appweaver/core/security/store/database-security-store' ||
  config.SECURITY_STORE_KEEP_DATABASE_TABLE;

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
