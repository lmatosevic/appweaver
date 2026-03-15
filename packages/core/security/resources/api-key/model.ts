import { uncapitalize } from '@appweaver/common';
import { createModel } from '../../../factory';
import { resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

export default createModel({
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
    authId: {
      type: 'int'
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
  read: {
    omit: ['authId']
  },
  create: {
    omit: ['authId', 'key']
  },
  update: {
    omit: ['authId', 'key', 'expiresAt']
  }
});
