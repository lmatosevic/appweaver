import { createModel } from '../../../factory';

export default createModel({
  name: 'Identity',
  scalars: {
    username: {
      type: 'string',
      unique: true,
      maxLength: 255
    },
    passwordHash: {
      type: 'string',
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
      model: 'Role',
      array: true
    }
  }
});
