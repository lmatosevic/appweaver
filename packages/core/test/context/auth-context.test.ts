import { AuthSource, AuthType, AuthUser } from '@appweaver/common';
import {
  currentApiKey,
  currentAuthSource,
  currentAuthType,
  currentAuthUser,
  isSystemCall,
  runAs,
  runInAuthContext,
  setAuthContext
} from '../../context/auth-context';

const user: AuthUser = { id: 1, email: 'user@test.com', roles: [] };

describe('auth-context', () => {
  describe('currentAuthUser', () => {
    test('is undefined outside of an auth context', () => {
      expect(currentAuthUser()).toBeUndefined();
      expect(currentAuthType()).toBeUndefined();
      expect(currentAuthSource()).toBeUndefined();
      expect(currentApiKey()).toBeUndefined();
    });
  });

  describe('isSystemCall', () => {
    test("is true for the application's own calls, outside of an auth context", () => {
      expect(isSystemCall()).toBe(true);
    });

    test('is false in a request and in a call run as a user or anonymously', () => {
      expect(runInAuthContext(() => isSystemCall())).toBe(false);
      expect(runAs(user, () => isSystemCall())).toBe(false);
      expect(runAs(null, () => isSystemCall())).toBe(false);
    });
  });

  describe('runInAuthContext', () => {
    test('starts without an authenticated user', () => {
      runInAuthContext(() => {
        expect(currentAuthUser()).toBeNull();
        expect(currentAuthType()).toBeNull();
      });
    });

    test('keeps the user set later in the same context, across awaits', async () => {
      await runInAuthContext(async () => {
        setAuthContext({
          authUser: user,
          authType: AuthType.ApiKey,
          authSource: AuthSource.ApiKey,
          apiKey: { id: 7 }
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(currentAuthUser()).toBe(user);
        expect(currentAuthType()).toBe(AuthType.ApiKey);
        expect(currentAuthSource()).toBe(AuthSource.ApiKey);
        expect(currentApiKey()).toEqual({ id: 7 });
      });
    });

    test('isolates the users of concurrent contexts', async () => {
      const other: AuthUser = { ...user, id: 2 };
      const read = (authUser: AuthUser) =>
        runInAuthContext(async () => {
          setAuthContext({ authUser });
          await new Promise((resolve) => setTimeout(resolve, 5));
          return currentAuthUser();
        });

      await expect(Promise.all([read(user), read(other)])).resolves.toEqual([
        user,
        other
      ]);
    });
  });

  describe('setAuthContext', () => {
    test('sets nothing outside of an auth context', () => {
      setAuthContext({ authUser: user });

      expect(currentAuthUser()).toBeUndefined();
    });
  });

  describe('runAs', () => {
    test('runs a function as the given user', async () => {
      const result = await runAs(
        user,
        async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return [currentAuthUser(), currentAuthType()];
        },
        { authType: AuthType.Jwt }
      );

      expect(result).toEqual([user, AuthType.Jwt]);
    });

    test('restores the previous context after the function', () => {
      runInAuthContext(() => {
        setAuthContext({ authUser: user });

        runAs(null, () => expect(currentAuthUser()).toBeNull());

        expect(currentAuthUser()).toBe(user);
      });
    });
  });
});
