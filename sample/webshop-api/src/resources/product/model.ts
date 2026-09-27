import { createModel } from '@appweaver/core';

// Money is kept in whole cents, so no rounding error creeps into a total
export default createModel({
  name: 'Product',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 200,
      example: 'Sonora Studio Wireless Headphones'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'sonora-studio-wireless'
    },
    sku: {
      type: 'string',
      unique: true,
      pattern: '^[A-Z0-9-]{4,32}$',
      example: 'SON-STU-WL-BLK'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 10000
    },
    // In cents, i.e. 12999 for 129.99 EUR
    price: {
      type: 'int',
      minimum: 0,
      example: 12999
    },
    // The former price shown struck through, in cents
    compareAtPrice: {
      type: 'int',
      required: false,
      minimum: 0,
      example: 15999
    },
    stock: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    status: {
      type: 'enum',
      values: ['Draft', 'Active', 'Archived'],
      default: 'Draft'
    },
    // Free-form specifications, i.e. { "color": "Black", "battery": "30 h" }
    attributes: {
      type: 'json',
      required: false
    },
    weightGrams: {
      type: 'int',
      required: false,
      minimum: 0
    }
  },
  relations: {
    category: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'products',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    brand: {
      model: 'Brand',
      type: 'oneToMany',
      mappedBy: 'products',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    reviews: {
      model: 'Review',
      type: 'oneToMany',
      mappedBy: 'product',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    orderItems: {
      model: 'OrderItem',
      type: 'oneToMany',
      mappedBy: 'product',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  files: {
    images: {
      array: true,
      maxCount: 8,
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'products/{resourceId}/{hash}.{extension}',
      maxSize: '5 MB',
      image: {
        quality: 82,
        maxWidth: 1600,
        maxHeight: 1600
      },
      output: {
        type: 'always',
        count: true
      }
    }
  },
  virtual: {
    inStock: {
      type: 'boolean',
      input: {
        type: 'none'
      },
      output: {
        value: (product: { stock: number }) => product.stock > 0
      }
    },
    discountPercent: {
      type: 'int',
      required: false,
      example: 19,
      input: {
        type: 'none'
      },
      output: {
        value: (product: { price: number; compareAtPrice?: number | null }) =>
          product.compareAtPrice && product.compareAtPrice > product.price
            ? Math.round((1 - product.price / product.compareAtPrice) * 100)
            : null
      }
    }
  },
  export: {
    description: {
      exclude: true
    },
    attributes: {
      exclude: true
    },
    images: {
      exclude: true
    },
    category: {
      headerName: 'Category',
      mapValue: 'name'
    },
    brand: {
      headerName: 'Brand',
      mapValue: 'name'
    }
  },
  index: [['status', 'categoryId', '+price'], '-createdAt']
});
