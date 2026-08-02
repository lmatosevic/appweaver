import { generateTypes } from '../../generators/generate-types';
import { createOpenApiSchema } from '../fixtures/openapi-schema';

describe('generate-types', () => {
  describe('generateTypes', () => {
    let types: string;

    beforeAll(async () => {
      types = await generateTypes(createOpenApiSchema());
    });

    test('generates the OpenAPI paths type', () => {
      expect(types).toContain('export type paths = {');
      expect(types).toContain('"/api/posts/{id}"');
      expect(types).toContain('"/auth/login"');
    });

    test('extracts schema definitions into named exported types', () => {
      expect(types).toContain('export type PostSingle = {');
      expect(types).toContain('export type PostQueryResponse = {');
      expect(types).toContain('export type LoginRequest = {');
      expect(types).toContain('export type HealthCheckResponse = {');
    });

    test('replaces the schema definition bodies with references', () => {
      expect(types).toMatch(/"def-1": PostSingle;/);
      expect(types).toMatch(/"def-16": HealthCheckResponse;/);
      expect(types).not.toMatch(/"def-\d+": \{/);
    });

    test('replaces cross references between definitions', () => {
      expect(types).toContain('items: PostSingle[]');
      expect(types).not.toContain('components["schemas"]["def-1"]');
    });

    test('references extracted types from the path operations', () => {
      expect(types).toContain('"application/json": LoginRequest;');
      expect(types).toContain('"application/json": AuthenticationResponse;');
    });

    test('adds validation JSDoc tags from the schema constraints', () => {
      expect(types).toContain('@minLength 3');
      expect(types).toContain('@maxLength 100');
      expect(types).toContain('@minimum 1');
      expect(types).toContain('@maximum 1000');
      expect(types).toContain('@pattern ^.{8,}$');
      expect(types).toContain('@format date-time');
      expect(types).toContain('@format email');
    });

    test('names generated enums after the extracted type', () => {
      expect(types).toContain('export enum PostSingleStatus {');
      expect(types).toContain('status?: PostSingleStatus;');
      expect(types).not.toContain('export enum Def1Status');
    });

    test('uses File types for binary file upload properties', () => {
      const fileUpload = types.slice(
        types.indexOf('export type PostFileUpload')
      );
      expect(fileUpload).toContain('image?: File;');
      expect(fileUpload).toContain('attachments?: File[];');
    });

    test('keeps plain string properties of non upload types unchanged', () => {
      const files = types.slice(types.indexOf('export type PostFiles'));
      expect(files).toContain('image?: string;');
    });

    test('builds the auth module type from the used auth types', () => {
      const authModule = moduleType(types, 'AuthModuleType');
      expect(authModule).toContain('loginRequest: LoginRequest');
      expect(authModule).toContain(
        'authenticationResponse: AuthenticationResponse'
      );
      expect(authModule).toContain('logoutResponse: LogoutResponse');
    });

    test('resolves the identity type from the auth me response', () => {
      expect(moduleType(types, 'AuthModuleType')).toContain(
        'identity: Identity'
      );
    });

    test('marks unused module types as never', () => {
      const authModule = moduleType(types, 'AuthModuleType');
      expect(authModule).toContain('changePasswordRequest: never');
      expect(authModule).toContain('exchangeTokenRequest: never');
    });

    test('builds the account and health module types', () => {
      expect(moduleType(types, 'AccountModuleType')).toContain(
        'emailVerificationRequest: AccountEmailVerificationRequest'
      );
      expect(moduleType(types, 'AccountModuleType')).toContain(
        'statusResponse: AccountStatusResponse'
      );
      expect(moduleType(types, 'HealthModuleType')).toContain(
        'checkResponse: HealthCheckResponse'
      );
      expect(moduleType(types, 'HealthModuleType')).toContain(
        'readyResponse: never'
      );
    });

    test('builds a module type for every resource', () => {
      const post = moduleType(types, 'PostResourceModuleType');
      expect(post).toContain('single: PostSingle');
      expect(post).toContain('queryRequest: PostQueryRequest');
      expect(post).toContain('queryResponse: PostQueryResponse');
      expect(post).toContain('fileUpload: PostFileUpload');
      expect(post).toContain('aggregateRequest: never');

      const user = moduleType(types, 'UserResourceModuleType');
      expect(user).toContain('single: UserSingle');
      expect(user).toContain('create: never');
    });

    test('accepts the schema as a JSON string', async () => {
      const fromString = await generateTypes(
        JSON.stringify(createOpenApiSchema())
      );
      expect(fromString).toBe(types);
    });
  });
});

function moduleType(types: string, name: string): string {
  const match = types.match(new RegExp(`export type ${name} = \\{[^}]*};`));
  expect(match).not.toBeNull();
  return match![0];
}
