import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Movie',
  // Short, URL friendly ids, i.e. /movies/V1StGXR8_Z5jdHi6B-myT
  id: {
    generator: 'nanoid()'
  },
  scalars: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      example: 'Arrival'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'arrival-2016'
    },
    originalTitle: {
      type: 'string',
      required: false,
      maxLength: 200
    },
    tagline: {
      type: 'string',
      required: false,
      maxLength: 300,
      example: 'Why are they here?'
    },
    overview: {
      type: 'string',
      required: false,
      maxLength: 5000
    },
    status: {
      type: 'enum',
      values: ['Announced', 'InProduction', 'Released'],
      default: 'Released'
    },
    releaseDate: {
      type: 'dateTime',
      required: false,
      example: '2016-11-11T00:00:00.000Z'
    },
    runtimeMinutes: {
      type: 'int',
      required: false,
      minimum: 1,
      maximum: 1000,
      example: 116
    },
    // ISO 639-1 code of the original language
    language: {
      type: 'string',
      pattern: '^[a-z]{2}$',
      default: 'en',
      example: 'en'
    },
    budgetUsd: {
      type: 'float',
      required: false,
      minimum: 0,
      example: 47000000
    },
    revenueUsd: {
      type: 'float',
      required: false,
      minimum: 0,
      example: 203400000
    },
    // i.e. ["linguistics", "first contact"]
    keywords: {
      type: 'json',
      required: false
    },
    // Maintained from the reviews, see the ratings feature
    rating: {
      type: 'float',
      default: 0,
      minimum: 0,
      maximum: 10
    },
    ratingCount: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    // Recomputed every night, see the trending feature
    trendingScore: {
      type: 'float',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    // Unknown genres are created on the fly, matched by their slug
    genres: {
      model: 'Genre',
      type: 'manyToMany',
      mappedBy: 'movies',
      required: false,
      input: {
        type: 'all',
        uniqueKey: 'slug',
        allowCreate: true
      },
      output: {
        type: 'always'
      }
    },
    // The cast and crew with the person of each credit
    credits: {
      model: 'Credit',
      type: 'oneToMany',
      mappedBy: 'movie',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true,
        include: {
          person: {
            type: 'always'
          }
        }
      }
    },
    reviews: {
      model: 'Review',
      type: 'oneToMany',
      mappedBy: 'movie',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    watchlistEntries: {
      model: 'WatchlistEntry',
      type: 'oneToMany',
      mappedBy: 'movie',
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
    poster: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'posters/{resourceId}-{hash}.{extension}',
      maxSize: '5 MB',
      image: {
        quality: 85,
        maxWidth: 780,
        maxHeight: 1170
      }
    },
    stills: {
      array: true,
      maxCount: 12,
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'stills/{resourceId}-{hash}.{extension}',
      maxSize: '8 MB',
      image: {
        quality: 80,
        maxWidth: 1920
      },
      output: {
        type: 'single',
        count: true
      }
    }
  },
  virtual: {
    year: {
      type: 'int',
      required: false,
      example: 2016,
      input: {
        type: 'none'
      },
      output: {
        value: (movie: { releaseDate?: Date | string | null }) =>
          movie.releaseDate
            ? new Date(movie.releaseDate).getUTCFullYear()
            : null
      }
    },
    runtime: {
      type: 'string',
      required: false,
      example: '1h 56m',
      input: {
        type: 'none'
      },
      output: {
        value: (movie: { runtimeMinutes?: number | null }) =>
          movie.runtimeMinutes
            ? `${Math.floor(movie.runtimeMinutes / 60)}h ${movie.runtimeMinutes % 60}m`
            : null
      }
    }
  },
  create: {
    omit: ['rating', 'ratingCount', 'trendingScore']
  },
  update: {
    omit: ['rating', 'ratingCount', 'trendingScore']
  },
  export: {
    overview: {
      exclude: true
    },
    keywords: {
      exclude: true
    },
    releaseDate: {
      headerName: 'Released',
      mapValue: (value: Date | null) =>
        value ? new Date(value).toISOString().slice(0, 10) : ''
    },
    genres: {
      headerName: 'Genres',
      mapValue: 'name'
    },
    poster: {
      exclude: true
    },
    stills: {
      exclude: true
    }
  },
  index: ['-trendingScore', '-rating', '-releaseDate', 'title']
});
