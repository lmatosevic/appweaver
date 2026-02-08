import { createModel } from '../../../factory';

export default createModel({
  name: 'File',
  scalars: {
    name: {
      type: 'text',
      maxLength: 1023,
      unique: true
    },
    originalName: {
      type: 'text',
      maxLength: 255
    },
    mimeType: {
      type: 'text',
      maxLength: 127
    },
    sizeBytes: {
      type: 'int',
      minimum: 0
    },
    title: {
      type: 'text',
      maxLength: 511,
      required: false
    },
    description: {
      type: 'text',
      maxLength: 4095,
      required: false
    },
    resourceField: {
      type: 'text',
      maxLength: 255,
      required: false
    },
    resourceName: {
      type: 'text',
      maxLength: 255,
      required: false
    },
    resourceId: {
      type: 'int',
      minimum: 1,
      required: false
    }
  }
});
