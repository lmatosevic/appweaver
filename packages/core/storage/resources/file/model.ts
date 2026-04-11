import { createModel } from '../../../factory';

export default createModel({
  name: 'File',
  scalars: {
    name: {
      type: 'string',
      maxLength: 1023,
      unique: true,
      example: 'image_123.png'
    },
    originalName: {
      type: 'string',
      maxLength: 255,
      example: 'image.png'
    },
    mimeType: {
      type: 'string',
      maxLength: 127
    },
    sizeBytes: {
      type: 'int',
      minimum: 0,
      example: 1024
    },
    title: {
      type: 'string',
      maxLength: 511,
      required: false
    },
    description: {
      type: 'string',
      maxLength: 4095,
      required: false
    },
    resourceField: {
      type: 'string',
      maxLength: 255,
      required: false,
      hidden: true
    },
    resourceName: {
      type: 'string',
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
