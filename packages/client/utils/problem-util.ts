import { OpenAPI3 } from 'openapi-typescript';
import { ERROR_CODE_TYPE_NAME, PROBLEM_DETAILS_TITLE } from '../constants';

/**
 * Rewrites the error codes every error response of an Appweaver schema narrows the problem
 * details to into a union of string literals, so each response types its codes inline instead
 * of declaring an enum of its own. The responses the operations share live in
 * `components.responses`, and narrow the codes in the second part of an `allOf`:
 *
 * ```json
 * { "allOf": [{ "$ref": "#/components/schemas/def-1" }, { "properties": { "code": { "enum": ["RESOURCE_NOT_FOUND"] } } }] }
 * ```
 *
 * @param {OpenAPI3} schema The schema to rewrite in place.
 */
export function inlineResponseErrorCodes(schema: OpenAPI3): void {
  const responses = [
    ...Object.values<any>(schema.components?.responses ?? {}),
    ...Object.values<any>(schema.paths ?? {}).flatMap((pathItem) =>
      Object.values<any>(pathItem ?? {}).flatMap((operation) =>
        Object.values<any>(operation?.responses ?? {})
      )
    )
  ];

  for (const response of responses) {
    for (const media of Object.values<any>(response?.content ?? {})) {
      for (const part of media?.schema?.allOf ?? []) {
        const code = part?.properties?.code;
        if (Array.isArray(code?.enum)) {
          part.properties.code = {
            anyOf: code.enum.map((value: string) => ({
              type: 'string',
              const: value
            }))
          };
        }
      }
    }
  }
}

/**
 * Renames the enum generated for the `code` of the problem details schema to `ErrorCode`,
 * unless the schema declares a type of that name itself.
 *
 * @param {string} content The generated TypeScript types.
 * @return {string} The types with the error code enum renamed.
 */
export function nameErrorCodeEnum(content: string): string {
  const generated = `${PROBLEM_DETAILS_TITLE}Code`;
  // Only a declaration of the name takes it, not a mention in a comment
  const declared = (name: string) =>
    new RegExp(`\\bexport (?:enum|type|const|interface) ${name}\\b`).test(
      content
    );
  if (!declared(generated) || declared(ERROR_CODE_TYPE_NAME)) {
    return content;
  }
  return content.replace(
    new RegExp(`\\b${generated}\\b`, 'g'),
    ERROR_CODE_TYPE_NAME
  );
}
