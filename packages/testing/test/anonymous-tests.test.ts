import { currentAuthUser, isSystemCall } from '@appweaver/core';
import { runTestsAsAnonymous } from '../anonymous-tests';

runTestsAsAnonymous();

describe('anonymous-tests', () => {
  describe('runTestsAsAnonymous', () => {
    test('runs a test in an anonymous request', () => {
      expect(isSystemCall()).toBe(false);
      expect(currentAuthUser()).toBeNull();
    });

    test('runs an async test in an anonymous request', async () => {
      await new Promise((resolve) => setImmediate(resolve));
      expect(isSystemCall()).toBe(false);
    });

    // eslint-disable-next-line jest/no-done-callback
    test('keeps the done callback of a test', (done) => {
      expect(isSystemCall()).toBe(false);
      done();
    });

    test.each([1, 2])('keeps the test modifiers (%i)', (value) => {
      expect(value).toBeGreaterThan(0);
    });

    it("leaves it as the application's own call", () => {
      expect(isSystemCall()).toBe(true);
    });
  });
});
