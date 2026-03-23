import { config, uncapitalize } from '@appweaver/common';
import { createModel } from '../../../factory';
import { resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

const shouldCreateModel =
  config.SECURITY_API_KEY_ENABLED ||
  config.SECURITY_API_KEY_KEEP_DATABASE_TABLE;

export default shouldCreateModel
  ? createModel({
      name: 'ApiKey',
      scalars: {
        key: {
          type: 'string'
        },
        keyHash: {
          type: 'string',
          unique: true,
          hidden: true
        },
        name: {
          type: 'string',
          required: false,
          maxLength: 255
        },
        description: {
          type: 'string',
          required: false
        },
        enabled: {
          type: 'boolean',
          default: true
        },
        expiresAt: {
          type: 'dateTime',
          required: false
        }
      },
      ...(authModel
        ? {
            relations: {
              [uncapitalize(authModel.name)]: {
                model: authModel.name,
                mappedBy: 'apiKeys',
                owner: true,
                input: {
                  type: 'none'
                },
                output: {
                  type: 'none'
                }
              }
            }
          }
        : {}),
      create: {
        omit: ['key']
      },
      update: {
        omit: ['key', 'expiresAt']
      }
    })
  : undefined;
