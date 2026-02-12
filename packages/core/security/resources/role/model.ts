import { createModel } from '../../../factory';

export default createModel({
  name: 'Role',
  scalars: {
    name: {
      type: 'string',
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
