import { resetContext } from '@appweaver/testing';

/** Imports the policy of the API keys with an auth model named `User`, which it relates the keys to. */
async function loadPolicy(): Promise<any> {
  process.env.SECURITY_API_KEY_ENABLED = 'true';
  jest.resetModules();
  const { createAuthModel } = await import('@appweaver/data');
  createAuthModel({ name: 'User' });
  return (await import('../../../../security/resources/api-key/policy'))
    .default;
}

describe('api-key policy', () => {
  const user = { id: 7, email: 'user@test.com', roles: [] };
  let policy: any;

  beforeAll(async () => {
    policy = await loadPolicy();
  });

  afterAll(() => {
    delete process.env.SECURITY_API_KEY_ENABLED;
    jest.resetModules();
    resetContext();
  });

  test('lets a user manage their own keys only', () => {
    expect(policy.checkAccess(user, { user: { id: 7 } }, 'create')).toBe(true);
    expect(policy.checkAccess(user, { user: { id: 8 } }, 'create')).toBe(false);
    expect(policy.checkAccess(user, {}, 'create')).toBe(false);
    expect(policy.checkAccess(user, { userId: 7 }, 'update')).toBe(true);
    expect(policy.checkAccess(user, { userId: 8 }, 'delete')).toBe(false);
    expect(policy.readRestrictions(user, 1, 'query')).toEqual({
      user: { id: 7 }
    });
  });

  test('denies an anonymous call every key', () => {
    expect(policy.checkAccess(null, { userId: 7 }, 'find')).toBe(false);
    expect(policy.checkAccess(null, { user: { id: 7 } }, 'create')).toBe(false);
    expect(policy.readRestrictions(null, 1, 'query')).toEqual({
      id: { in: [] }
    });
  });
});
