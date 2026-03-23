import { config } from '@appweaver/common';
import { createModel } from '../../../factory';

const shouldCreateModel =
  config.SECURITY_STORE_PROVIDER ===
    '@appweaver/core/security/store/database-security-store' ||
  config.SECURITY_STORE_KEEP_DATABASE_TABLE;

export default shouldCreateModel
  ? createModel({
      name: 'OneTimeToken',
      audit: {
        createdById: false
      },
      scalars: {
        tokenHash: {
          type: 'string',
          maxLength: 511
        },
        purpose: {
          type: 'string',
          maxLength: 255
        },
        expiresAt: {
          type: 'dateTime'
        },
        data: {
          type: 'json'
        }
      },
      index: [['tokenHash', 'purpose']]
    })
  : undefined;
