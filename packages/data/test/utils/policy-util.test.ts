import { runAs, runInAuthContext } from '@appweaver/core';
import { arePoliciesSkipped, withoutPolicies } from '../../utils/policy-util';

const user = { id: 1, email: 'user@test.com', roles: [] };

describe('policy-util', () => {
  describe('withoutPolicies', () => {
    test('returns the value of the function', () => {
      expect(withoutPolicies(() => 42)).toBe(42);
    });

    test('skips the policies through the async calls of the function', async () => {
      const skipped = await runAs(user, () =>
        withoutPolicies(async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return arePoliciesSkipped();
        })
      );

      expect(skipped).toBe(true);
    });

    test('ends the internal access with the function', async () => {
      await runAs(user, async () => {
        await withoutPolicies(async () => undefined);

        expect(arePoliciesSkipped()).toBe(false);
      });
    });
  });

  describe('arePoliciesSkipped', () => {
    test('returns false for a user or an anonymous request', () => {
      expect(runAs(user, () => arePoliciesSkipped())).toBe(false);
      expect(runAs(null, () => arePoliciesSkipped())).toBe(false);
      expect(runInAuthContext(() => arePoliciesSkipped())).toBe(false);
    });

    test('returns true inside of the internal access', () => {
      expect(
        runAs(user, () => withoutPolicies(() => arePoliciesSkipped()))
      ).toBe(true);
    });

    test("returns true for the application's own calls, outside of an auth context", () => {
      expect(arePoliciesSkipped()).toBe(true);
    });
  });
});
