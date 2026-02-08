import { createModel } from '../../../factory';

export default createModel({
  name: 'Permission',
  scalars: {
    name: {
      type: 'text',
      maxLength: 255
    }
  }
});
