import { Type } from '@sinclair/typebox';

export const ClientErrorResponse = Type.Object({
  errorCode: Type.Integer({ example: 400 }),
  message: Type.String({ example: 'Client error description' })
});

export const ServerErrorResponse = Type.Object({
  errorCode: Type.Integer({ example: 500 }),
  message: Type.String({ example: 'Server error description' })
});

export const AllErrorResponses = {
  '4xx': {
    description: 'Client error',
    content: {
      'application/json': {
        schema: ClientErrorResponse
      }
    }
  },
  '5xx': {
    description: 'Server error',
    content: {
      'application/json': {
        schema: ServerErrorResponse
      }
    }
  }
};
