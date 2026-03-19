import { Type } from '@sinclair/typebox';

export const ErrorResponse = Type.Object({
  errorCode: Type.Integer({ examples: [400] }),
  message: Type.String({ examples: ['Error description'] })
});

export const AllErrorResponses = {
  '4xx': {
    description: 'Client error',
    content: {
      'application/json': {
        schema: ErrorResponse
      }
    }
  },
  '5xx': {
    description: 'Server error',
    content: {
      'application/json': {
        schema: ErrorResponse
      }
    }
  }
};
