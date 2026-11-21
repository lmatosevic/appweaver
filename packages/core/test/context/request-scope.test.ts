import {
  currentRequestScope,
  runInRequestScope,
  setRequestScope
} from '../../context/request-scope';

describe('request-scope', () => {
  describe('currentRequestScope', () => {
    test('is undefined outside of a scope', () => {
      expect(currentRequestScope()).toBeUndefined();
    });
  });

  describe('runInRequestScope', () => {
    test('runs the function in the scope, through its async calls', async () => {
      const scope = await runInRequestScope(
        { source: 'task', action: 'task.import' },
        async () => {
          await Promise.resolve();
          return currentRequestScope();
        }
      );

      expect(scope).toEqual({ source: 'task', action: 'task.import' });
    });

    test('returns the value of the function', () => {
      expect(runInRequestScope({ source: 'job' }, () => 42)).toBe(42);
    });
  });

  describe('setRequestScope', () => {
    test('changes the scope given to runInRequestScope', () => {
      const scope = { source: 'http' as const };

      runInRequestScope(scope, () =>
        setRequestScope({ source: 'mcp', action: 'mcp.post_create' })
      );

      expect(scope).toEqual({ source: 'mcp', action: 'mcp.post_create' });
    });

    test('sets nothing outside of a scope', () => {
      setRequestScope({ source: 'mcp' });

      expect(currentRequestScope()).toBeUndefined();
    });
  });
});
