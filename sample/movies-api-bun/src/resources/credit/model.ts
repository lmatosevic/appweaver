import { createModel } from '@appweaver/core';

/**
 * Joins a person to a movie, carrying what the plain many-to-many join table
 * could not: the role, the character played, and the billing order.
 */
export default createModel({
  name: 'Credit',
  scalars: {
    role: {
      type: 'enum',
      values: ['Cast', 'Director', 'Writer', 'Producer', 'Composer'],
      default: 'Cast'
    },
    character: {
      type: 'string',
      required: false,
      maxLength: 150,
      example: 'Louise Banks'
    },
    // Position in the credits, the lead first
    billingOrder: {
      type: 'int',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    movie: {
      model: 'Movie',
      type: 'oneToMany',
      mappedBy: 'credits',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    person: {
      model: 'Person',
      type: 'oneToMany',
      mappedBy: 'credits',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    }
  },
  unique: [['movieId', 'personId', 'role']],
  index: [['movieId', 'role', '+billingOrder']]
});
