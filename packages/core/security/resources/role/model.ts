import { createModel } from '../../../factory';

export default createModel({
  name: 'Role',
  scalars: {
    name: {
      type: 'text',
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
