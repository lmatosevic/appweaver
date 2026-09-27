import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  scalars: {
    displayName: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      example: 'cinephile42'
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'member@movies.example.com'
    },
    bio: {
      type: 'string',
      required: false,
      maxLength: 500
    }
  },
  relations: {
    reviews: {
      model: 'Review',
      type: 'oneToMany',
      mappedBy: 'author',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    watchlist: {
      model: 'WatchlistEntry',
      type: 'oneToMany',
      mappedBy: 'user',
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
    // Downloaded from the OAuth2 provider on the first sign-in
    avatar: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'avatars/{resourceId}-{hash}.{extension}',
      maxSize: '2 MB',
      image: {
        quality: 80,
        width: 200,
        height: 200,
        fit: 'cover'
      }
    }
  }
});
