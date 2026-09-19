import { config, uncapitalize } from '@appweaver/common';
import { createModel } from '../../../factory';
import { isOAuth2Enabled, resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

const shouldCreateModel =
  isOAuth2Enabled() ||
  config.SECURITY_OAUTH2_CONNECTED_ACCOUNTS_KEEP_DATABASE_TABLE;

export default shouldCreateModel
  ? createModel({
      name: 'ConnectedAccount',
      // Cascades from the auth model, so it is soft deleted together with it
      softDelete: !!authModel?.config.softDelete,
      audit: {
        createdById: false
      },
      scalars: {
        provider: {
          type: 'string',
          maxLength: 255
        },
        providerAccountId: {
          type: 'string',
          maxLength: 255
        },
        scope: {
          type: 'string',
          required: false
        },
        lastLoginAt: {
          type: 'dateTime'
        }
      },
      ...(authModel
        ? {
            relations: {
              [uncapitalize(authModel.name)]: {
                model: authModel.name,
                type: 'oneToMany',
                mappedBy: 'connectedAccounts',
                owner: true,
                // Connected accounts are meaningless without their user
                onDelete: 'cascade',
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
      // A provider account may only ever be linked to a single user
      unique: [['provider', 'providerAccountId']]
    })
  : undefined;
