import { runAs } from '@appweaver/core';

type TestFn = (...args: unknown[]) => unknown;

/**
 * Runs every `test` of the calling file in the auth context of an anonymous request (`runAs(null, ...)`), so the
 * resource and file policies apply to the services the tests call, which the application's own calls, outside of a
 * request, skip. Called once at the top level of a test file; a test sets its user with `setAuthContext` or `runAs`.
 * `it` and the modifiers (`test.each`, `test.skip`) are left as they are, `it` for the tests of the application's own
 * calls.
 */
export function runTestsAsAnonymous(): void {
  const globals = globalThis as unknown as Record<'test', TestFn>;
  const original = globals.test;
  const wrapped = (title: unknown, fn?: TestFn, timeout?: number) =>
    original(title, fn && inRequest(fn), timeout);
  globals.test = Object.assign(wrapped, original);
}

/** The test function run in an anonymous request, keeping its arity, by which Jest tells a `done` callback. */
function inRequest(fn: TestFn): TestFn {
  return fn.length > 0
    ? function (this: unknown, done: unknown) {
        return runAs(null, () => fn.call(this, done));
      }
    : function (this: unknown) {
        return runAs(null, () => fn.call(this));
      };
}
