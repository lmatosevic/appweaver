import { createModel } from '../../../factory';

export default createModel({
  name: 'Role',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      maxLength: 255
    }
  },
  relations: {
    permissions: {
      model: 'Permission',
      array: true
    }
  }
});
