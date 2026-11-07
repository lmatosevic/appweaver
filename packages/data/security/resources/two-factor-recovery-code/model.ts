import { uncapitalize } from '@appweaver/common';
import { createModel } from '../../../factory/create-model';
import { isTwoFactorEnabled, resourceAuthModel } from '../../helper';

const authModel = resourceAuthModel();

export default isTwoFactorEnabled()
  ? createModel({
      name: 'TwoFactorRecoveryCode',
      // Cascades from the auth model, so it is soft deleted together with it
      softDelete: !!authModel?.config.softDelete,
      audit: {
        updatedAt: false,
        createdById: false
      },
      scalars: {
        // The SHA-256 of the normalized code, whose randomness makes a slow hash unnecessary
        codeHash: {
          type: 'string',
          maxLength: 64,
          unique: true,
          hidden: true
        },
        usedAt: {
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
                mappedBy: 'twoFactorRecoveryCodes',
                // The codes are meaningless without their user
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
        : {})
    })
  : undefined;
