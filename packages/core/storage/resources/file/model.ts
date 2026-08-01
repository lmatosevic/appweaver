import { createModel } from '../../../factory';
import { buildFileUrl } from '../../../utils';
import { File } from '../../../types';

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
    checksum: {
      type: 'string',
      maxLength: 127,
      example:
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
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
  virtual: {
    url: {
      type: 'string',
      input: {
        type: 'none'
      },
      output: {
        value: (file: File) => buildFileUrl(file)
      }
    }
  },
  index: [['resourceField', 'resourceName', 'resourceId']]
});
