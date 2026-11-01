import { uncapitalize } from '@appweaver/common';
import { apiKeyConfig } from '../../auth-config';
import { createModel } from '../../../factory/create-model';
import { resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

const shouldCreateModel =
  apiKeyConfig.ENABLED || apiKeyConfig.KEEP_DATABASE_TABLE;

export default shouldCreateModel
  ? createModel({
      name: 'ApiKey',
      // Cascades from the auth model, so it is soft deleted together with it
      softDelete: !!authModel?.config.softDelete,
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
                type: 'manyToOne',
                mappedBy: 'apiKeys',
                // API keys are meaningless without their user
                onDelete: 'cascade',
                input: {
                  type: 'none'
                },
                output: {
                  type: 'none'
                }
              },
              // The scope of the key, a subset of the ones of its owner, the full access of the owner when empty
              roles: {
                model: 'Role',
                type: 'manyToMany',
                required: false,
                input: {
                  type: 'all'
                },
                output: {
                  type: 'always'
                }
              },
              permissions: {
                model: 'Permission',
                type: 'manyToMany',
                required: false,
                input: {
                  type: 'all'
                },
                output: {
                  type: 'always'
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
