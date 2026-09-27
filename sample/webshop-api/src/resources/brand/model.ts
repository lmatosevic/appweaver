import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Brand',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      minLength: 1,
      maxLength: 100,
      example: 'Sonora'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'sonora'
    },
    website: {
      type: 'string',
      required: false,
      format: 'uri',
      maxLength: 255
    }
  },
  relations: {
    products: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'brand',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    }
  },
  files: {
    logo: {
      mimeType: 'image/(png|webp)',
      namePattern: 'brands/{resourceId}-{hash}.{extension}',
      maxSize: '1 MB'
    }
  }
});
