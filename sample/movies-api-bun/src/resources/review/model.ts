import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Review',
  scalars: {
    rating: {
      type: 'int',
      minimum: 1,
      maximum: 10,
      example: 9
    },
    title: {
      type: 'string',
      required: false,
      maxLength: 150,
      example: 'Language as a weapon'
    },
    body: {
      type: 'string',
      required: false,
      maxLength: 10000
    },
    containsSpoilers: {
      type: 'boolean',
      default: false
    },
    // A snapshot of the display name, so a public review never exposes the
    // account (and the email) of its author
    authorName: {
      type: 'string',
      maxLength: 50,
      example: 'cinephile42'
    }
  },
  relations: {
    movie: {
      model: 'Movie',
      type: 'oneToMany',
      mappedBy: 'reviews',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    // Set to the signed-in member
    author: {
      model: 'User',
      type: 'oneToMany',
      mappedBy: 'reviews',
      owner: true,
      required: false,
      onDelete: 'cascade',
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  create: {
    omit: ['authorName']
  },
  // A member reviews a movie once, and edits the review afterwards
  update: {
    omit: ['movie', 'authorName']
  },
  unique: [['movieId', 'authorId']],
  index: [['movieId', '-createdAt']]
});
