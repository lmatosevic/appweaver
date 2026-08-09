import { OpenAPI3 } from 'openapi-typescript';

/**
 * A compact OpenAPI v3 schema shaped like the one produced by an Appweaver
 * application (`weaver openapi`). It covers every route group the generators
 * recognize: auth, account, health, files, resources and custom routes.
 */
export function createOpenApiSchema(): OpenAPI3 {
  return JSON.parse(JSON.stringify(SCHEMA));
}

const response = (def: string) => ({
  200: {
    description: 'Default Response',
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${def}` } }
    }
  }
});

const body = (def: string, mimeType: string = 'application/json') => ({
  required: true,
  content: { [mimeType]: { schema: { $ref: `#/components/schemas/${def}` } } }
});

const idParameter = [
  {
    schema: { type: 'integer' },
    in: 'path',
    name: 'id',
    required: true
  }
];

const SCHEMA: any = {
  openapi: '3.0.3',
  info: {
    title: 'CMS API',
    description: 'Sample Appweaver application for CMS API',
    version: '1.0.0'
  },
  'x-appweaver-config': {
    resourcePaths: [
      { name: 'Post', basePath: '/posts' },
      { name: 'User', basePath: '/users' }
    ],
    routePrefixes: {
      api: '/api',
      static: '/public',
      health: '/health',
      auth: '/auth',
      account: '/auth/account',
      files: '/files'
    }
  },
  components: {
    schemas: {
      'def-1': {
        title: 'PostSingle',
        type: 'object',
        required: ['id', 'title'],
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', minLength: 3, maxLength: 100 },
          content: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published'] },
          publishedAt: { type: 'string', format: 'date-time' }
        }
      },
      'def-2': {
        title: 'PostQueryRequest',
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, maximum: 1000 },
          size: { type: 'integer' },
          sort: { $ref: '#/components/schemas/def-20' }
        }
      },
      'def-20': {
        title: 'PostQuerySort',
        description: 'Query sort for the Post resource',
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['asc', 'desc'], example: 'desc' },
          title: { type: 'string', enum: ['asc', 'desc'], example: 'desc' },
          author: { $ref: '#/components/schemas/def-21' }
        }
      },
      'def-21': {
        title: 'UserQuerySort',
        description: 'Query sort for the User resource',
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['asc', 'desc'], example: 'desc' },
          email: { type: 'string', enum: ['asc', 'desc'], example: 'desc' }
        }
      },
      'def-3': {
        title: 'PostQueryResponse',
        type: 'object',
        required: ['items', 'total'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/def-1' }
          },
          total: { type: 'integer' }
        }
      },
      'def-4': {
        title: 'PostCreate',
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 100 },
          content: { type: 'string' },
          visibility: { type: 'string', enum: ['public', 'private'] }
        }
      },
      'def-5': {
        title: 'PostUpdate',
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 100 },
          visibility: { type: 'string', enum: ['public', 'private'] }
        }
      },
      'def-6': {
        title: 'PostFileUpload',
        type: 'object',
        properties: {
          image: { type: 'string', format: 'binary' },
          attachments: {
            type: 'array',
            items: { type: 'string', format: 'binary' }
          }
        }
      },
      'def-7': {
        title: 'PostFiles',
        type: 'object',
        properties: {
          image: { type: 'string' }
        }
      },
      'def-8': {
        title: 'UserSingle',
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' }
        }
      },
      'def-10': {
        title: 'LoginRequest',
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string', pattern: '^.{8,}$' }
        }
      },
      'def-11': {
        title: 'AuthenticationResponse',
        type: 'object',
        required: ['accessToken'],
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' }
        }
      },
      'def-12': {
        title: 'LogoutResponse',
        type: 'object',
        properties: { status: { type: 'boolean' } }
      },
      'def-13': {
        title: 'Identity',
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } }
        }
      },
      'def-14': {
        title: 'AccountEmailVerificationRequest',
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      'def-15': {
        title: 'AccountStatusResponse',
        type: 'object',
        properties: { status: { type: 'boolean' } }
      },
      'def-16': {
        title: 'HealthCheckResponse',
        type: 'object',
        properties: {
          status: { type: 'string' },
          uptime: { type: 'number' }
        }
      }
    }
  },
  paths: {
    '/auth/login': {
      post: {
        requestBody: body('def-10'),
        responses: response('def-11')
      }
    },
    '/auth/login/google': {
      get: { responses: { 302: { description: 'Redirect' } } }
    },
    '/auth/logout': {
      post: { responses: response('def-12') }
    },
    '/auth/me': {
      get: { responses: response('def-13') }
    },
    '/auth/account/verify-email': {
      post: {
        requestBody: body('def-14'),
        responses: response('def-15')
      }
    },
    '/health/check': {
      get: { responses: response('def-16') }
    },
    '/files/public/{*}': {
      get: {
        parameters: [
          { schema: { type: 'string' }, in: 'path', name: '*', required: true }
        ],
        responses: { 200: { description: 'File content' } }
      }
    },
    '/api/': {
      get: { responses: { 200: { description: 'Application info' } } }
    },
    '/api/publish-posts': {
      post: { responses: { 200: { description: 'Published posts' } } }
    },
    '/api/posts/{id}': {
      get: {
        'x-appweaver-resource': 'Post',
        parameters: idParameter,
        responses: response('def-1')
      },
      put: {
        'x-appweaver-resource': 'Post',
        parameters: idParameter,
        requestBody: body('def-5'),
        responses: response('def-1')
      },
      delete: {
        'x-appweaver-resource': 'Post',
        parameters: idParameter,
        responses: response('def-1')
      }
    },
    '/api/posts/query': {
      post: {
        'x-appweaver-resource': 'Post',
        requestBody: body('def-2'),
        responses: response('def-3')
      }
    },
    '/api/posts': {
      post: {
        'x-appweaver-resource': 'Post',
        requestBody: body('def-4'),
        responses: response('def-1')
      }
    },
    '/api/posts/{id}/files': {
      post: {
        'x-appweaver-resource': 'Post',
        parameters: idParameter,
        requestBody: body('def-6', 'multipart/form-data'),
        responses: response('def-7')
      }
    },
    '/api/users/{id}': {
      get: {
        'x-appweaver-resource': 'User',
        parameters: idParameter,
        responses: response('def-8')
      }
    }
  }
};
