import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Genre',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      minLength: 2,
      maxLength: 50,
      example: 'Science Fiction'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'science-fiction'
    }
  },
  relations: {
    movies: {
      model: 'Movie',
      type: 'manyToMany',
      mappedBy: 'genres',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    }
  }
});
