import { createModel } from '../../../factory';

export default createModel({
  name: 'Identity',
  scalars: {
    username: {
      type: 'text',
      unique: true,
      maxLength: 255
    },
    passwordHash: {
      type: 'text',
      required: false,
      hidden: true
    },
    enabled: {
      type: 'boolean',
      default: true
    },
    logoutAt: {
      type: 'dateTime',
      required: false
    }
  },
  relations: {
    roles: {
      references: {
        model: 'Role',
        array: true
      }
    }
  }
});
