import { TwoFactorMethodType, uncapitalize } from '@appweaver/common';
import { createModel } from '../../../factory/create-model';
import { isTwoFactorEnabled, resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

export default isTwoFactorEnabled()
  ? createModel({
      name: 'TwoFactorMethod',
      // Cascades from the auth model, so it is soft deleted together with it
      softDelete: !!authModel?.config.softDelete,
      audit: {
        createdById: false
      },
      scalars: {
        type: {
          type: 'enum',
          values: Object.values(TwoFactorMethodType)
        },
        // The order of the methods of a user, the lowest is the default
        priority: {
          type: 'int',
          default: 0
        },
        // The encrypted TOTP secret
        secret: {
          type: 'string',
          required: false,
          hidden: true
        },
        // Unset while a TOTP method waits for the confirmation of its first code
        confirmedAt: {
          type: 'dateTime',
          required: false
        },
        // The last accepted TOTP time step, so a code is never accepted twice
        lastUsedStep: {
          type: 'int',
          required: false,
          hidden: true
        }
      },
      ...(authModel
        ? {
            relations: {
              [uncapitalize(authModel.name)]: {
                model: authModel.name,
                type: 'manyToOne',
                mappedBy: 'twoFactorMethods',
                // The methods are meaningless without their user
                onDelete: 'cascade',
                input: {
                  type: 'none'
                },
                output: {
                  type: 'none'
                }
              }
            },
            unique: [[`${uncapitalize(authModel.name)}Id`, 'type']]
          }
        : {})
    })
  : undefined;
