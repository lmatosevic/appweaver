import { createModel } from '../../../factory';

export default createModel({
  name: 'Permission',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      maxLength: 255
    }
  }
});
