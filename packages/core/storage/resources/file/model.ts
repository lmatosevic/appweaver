import { createModel } from '../../../factory';

export default createModel({
  name: 'File',
  scalars: {
    name: {
      type: 'text',
      maxLength: 1023,
      unique: true,
      examples: ['image_123.png']
    },
    originalName: {
      type: 'text',
      maxLength: 255,
      examples: ['image.png']
    },
    mimeType: {
      type: 'text',
      maxLength: 127
    },
    sizeBytes: {
      type: 'int',
      minimum: 0,
      examples: [1024]
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
      required: false,
      hidden: true
    },
    resourceName: {
      type: 'text',
      maxLength: 255,
      required: false,
      hidden: true
    },
    resourceId: {
      type: 'int',
      minimum: 1,
      required: false,
      hidden: true
    }
  },
  index: [['resourceField', 'resourceName', 'resourceId']]
});
