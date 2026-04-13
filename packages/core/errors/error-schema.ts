import { Type } from '@sinclair/typebox';
import { createSchemaModel } from '../utils';

export const ClientErrorResponse = Type.Object(
  {
    errorCode: Type.Integer({ example: 400 }),
    message: Type.String({ example: 'Client error description' })
  },
  { $id: 'ClientErrorResponse' }
);

export const ServerErrorResponse = Type.Object(
  {
    errorCode: Type.Integer({ example: 500 }),
    message: Type.String({ example: 'Server error description' })
  },
  { $id: 'ServerErrorResponse' }
);

export const AllErrorResponses = {
  '4xx': {
    description: 'Client error',
    content: {
      'application/json': {
        schema: createSchemaModel(ClientErrorResponse)
      }
    }
  },
  '5xx': {
    description: 'Server error',
    content: {
      'application/json': {
        schema: createSchemaModel(ServerErrorResponse)
      }
    }
  }
};
