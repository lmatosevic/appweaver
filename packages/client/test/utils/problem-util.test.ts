import {
  inlineResponseErrorCodes,
  nameErrorCodeEnum
} from '../../utils/problem-util';

describe('problem-util', () => {
  describe('inlineResponseErrorCodes', () => {
    test('rewrites the narrowed codes of a response into string constants', () => {
      const schema: any = {
        paths: {
          '/posts/{id}': {
            get: {
              responses: {
                404: {
                  content: {
                    'application/problem+json': {
                      schema: {
                        allOf: [
                          { $ref: '#/components/schemas/def-0' },
                          {
                            type: 'object',
                            properties: {
                              code: { type: 'string', enum: ['A', 'B'] }
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      inlineResponseErrorCodes(schema);

      const media =
        schema.paths['/posts/{id}'].get.responses[404].content[
          'application/problem+json'
        ];
      expect(media.schema.allOf[1].properties.code).toEqual({
        anyOf: [
          { type: 'string', const: 'A' },
          { type: 'string', const: 'B' }
        ]
      });
    });

    test('rewrites the codes of the shared responses', () => {
      const schema: any = {
        components: {
          responses: {
            NotFoundError: {
              content: {
                'application/problem+json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/def-0' },
                      { properties: { code: { enum: ['A'] } } }
                    ]
                  }
                }
              }
            }
          }
        }
      };

      inlineResponseErrorCodes(schema);

      expect(
        schema.components.responses.NotFoundError.content[
          'application/problem+json'
        ].schema.allOf[1].properties.code
      ).toEqual({ anyOf: [{ type: 'string', const: 'A' }] });
    });

    test('leaves the other responses as they are', () => {
      const response = {
        content: { 'application/json': { schema: { type: 'object' } } }
      };
      const schema: any = {
        paths: { '/posts': { get: { responses: { 200: response } } } }
      };

      inlineResponseErrorCodes(schema);

      expect(schema.paths['/posts'].get.responses[200]).toEqual({
        content: { 'application/json': { schema: { type: 'object' } } }
      });
    });
  });

  describe('nameErrorCodeEnum', () => {
    test('renames the code enum of the problem details', () => {
      const content =
        "export enum ProblemDetailsCode {\n  A = 'A'\n}\nexport type ProblemDetails = { code: ProblemDetailsCode };";

      expect(nameErrorCodeEnum(content)).toBe(
        "export enum ErrorCode {\n  A = 'A'\n}\nexport type ProblemDetails = { code: ErrorCode };"
      );
    });

    test('renames the enum when ErrorCode is mentioned in a comment only', () => {
      const content =
        "/** The ErrorCode of the API */\nexport enum ProblemDetailsCode {\n  A = 'A'\n}";

      expect(nameErrorCodeEnum(content)).toContain('export enum ErrorCode {');
    });

    test('keeps the name when the schema declares an ErrorCode itself', () => {
      const content =
        "export enum ProblemDetailsCode {\n  A = 'A'\n}\nexport type ErrorCode = string;";

      expect(nameErrorCodeEnum(content)).toBe(content);
    });
  });
});
