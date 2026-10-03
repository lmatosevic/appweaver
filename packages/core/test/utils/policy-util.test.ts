import { arePoliciesSkipped, withoutPolicies } from '../../utils/policy-util';

describe('policy-util', () => {
  describe('withoutPolicies', () => {
    test('returns the value of the function', () => {
      expect(withoutPolicies(() => 42)).toBe(42);
    });

    test('skips the policies through the async calls of the function', async () => {
      const skipped = await withoutPolicies(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return arePoliciesSkipped();
      });

      expect(skipped).toBe(true);
    });

    test('ends the internal access with the function', async () => {
      await withoutPolicies(async () => undefined);

      expect(arePoliciesSkipped()).toBe(false);
    });
  });

  describe('arePoliciesSkipped', () => {
    test('returns false outside of the internal access', () => {
      expect(arePoliciesSkipped()).toBe(false);
    });

    test('returns true inside of the internal access', () => {
      expect(withoutPolicies(() => arePoliciesSkipped())).toBe(true);
    });
  });
});
