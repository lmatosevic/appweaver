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

    test('extracts schema definitions carrying a description', () => {
      expect(types).toContain('export type PostQuerySort = {');
      expect(types).toContain('export type UserQuerySort = {');
      expect(types).toContain('@description Query sort for the Post resource');
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
      expect(types).toContain('export const PostSingleStatus = {');
      expect(types).toContain('status?: PostSingleStatus;');
      expect(types).not.toMatch(/\bDef\d+\w*\b/);
    });

    test('generates the enums as objects usable as values and as literals', () => {
      expect(types).not.toContain('export enum ');
      expect(types).toContain(
        'export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];'
      );
      expect(enumMembers(types, 'SortDirection')).toEqual([
        'asc: "asc"',
        'desc: "desc"'
      ]);
    });

    test('hoists a repeated enum into a single shared enum', () => {
      expect(enumNames(types, 'asc: "asc"')).toEqual(['SortDirection']);
      expect(types).toContain('id?: SortDirection;');
      expect(types).toContain('email?: SortDirection;');
    });

    test('names a hoisted enum after the definitions sharing it', () => {
      expect(enumNames(types, 'public: "public"')).toEqual(['PostVisibility']);
      expect(types).toContain('visibility?: PostVisibility;');
    });

    test('declares the repeated filter value once and references it', () => {
      expect(types).toContain(
        'export type QueryFilterScalar = string | number | boolean | null;'
      );
      expect(types).toMatch(
        /export type QueryFilterValue = QueryFilterScalar \| QueryFilterScalar\[] \| QueryCondition;/
      );

      const filter = extractType(types, 'PostQueryFilter');
      expect(filter).toContain('id?: QueryFilterValue;');
      expect(filter).toContain('title?: QueryFilterValue;');
      expect(filter).not.toContain('string | number | boolean | null');
    });

    test('keeps the branches a relation filter adds to the plain values', () => {
      expect(extractType(types, 'PostQueryFilter')).toContain(
        'author?: QueryFilterScalar | QueryFilterScalar[] | UserQueryFilter | UserQueryFilter[];'
      );
    });

    test('keeps the description of every filtered field', () => {
      const filter = extractType(types, 'PostQueryFilter');
      expect(filter).toContain('@description Filter by the record id');
      expect(filter).toContain('@description Filter by the title field');
      expect(filter).toContain('@description Filter by the author relation');
    });

    test('leaves the references to the hoisted enums resolvable', () => {
      expect(types).not.toContain('components["schemas"]["SortDirection"]');
      expect(types).not.toContain('components["schemas"]["PostVisibility"]');
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

      expect(post).toContain('querySort: PostQuerySort');

      const user = moduleType(types, 'UserResourceModuleType');
      expect(user).toContain('single: UserSingle');
      expect(user).toContain('create: never');
    });

    test('keeps the schema given by the caller unchanged', async () => {
      const schema = createOpenApiSchema();
      await generateTypes(schema);
      expect(schema).toEqual(createOpenApiSchema());
    });

    test('accepts the schema as a JSON string', async () => {
      const fromString = await generateTypes(
        JSON.stringify(createOpenApiSchema())
      );
      expect(fromString).toBe(types);
    });

    test('declares the enum objects when generating a declaration file', async () => {
      const declarations = await generateTypes(createOpenApiSchema(), {
        declaration: true
      });

      expect(declarations).toContain('export declare const SortDirection: {');
      expect(declarations).toContain('readonly asc: "asc";');
      expect(declarations).not.toContain('as const');
      expect(declarations).toContain(
        'export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];'
      );
    });
  });
});

function extractType(types: string, name: string): string {
  const start = types.indexOf(`export type ${name} = {`);
  expect(start).toBeGreaterThanOrEqual(0);

  // The body ends on the first line holding nothing but the closing brace
  const end = types.slice(start).search(/\n\s*}/);
  return types.slice(start, start + end);
}

function enumNames(types: string, member: string): string[] {
  const names: string[] = [];
  const pattern = /export const (\w+) = \{([^}]*)} as const;/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(types)) !== null) {
    if (match[2].includes(member)) {
      names.push(match[1]);
    }
  }

  return names;
}

function enumMembers(types: string, name: string): string[] {
  const match = types.match(
    new RegExp(`export const ${name} = \\{([^}]*)} as const;`)
  );
  expect(match).not.toBeNull();
  return match![1]
    .split(',')
    .map((member) => member.trim())
    .filter(Boolean);
}

function moduleType(types: string, name: string): string {
  const match = types.match(new RegExp(`export type ${name} = \\{[^}]*};`));
  expect(match).not.toBeNull();
  return match![0];
}
