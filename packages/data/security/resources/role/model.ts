import { createModel } from '../../../factory/create-model';

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
      type: 'manyToMany'
    }
  },
  read: {
    omit: ['updatedAt', 'createdAt', 'createdById']
  }
});
