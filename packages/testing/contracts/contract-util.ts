/** Creates the instance a contract suite tests, i.e. `() => new GcsStorage()`. */
export type ContractFactory<T> = () => T | Promise<T>;

/** Waits the given milliseconds. */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The matchers the suites use, shared by Jest, Vitest and Bun. */
type Matchers = {
  toBe(expected: unknown): unknown;
  toEqual(expected: unknown): unknown;
  toMatchObject(expected: object): unknown;
  toBeDefined(): unknown;
  toBeUndefined(): unknown;
  toBeNull(): unknown;
  toBeTruthy(): unknown;
  toThrow(expected?: unknown): unknown;
};

type Assertion = Matchers & {
  not: Matchers;
  resolves: Matchers & { not: Matchers };
  rejects: Matchers & { not: Matchers };
};

type Hook = (fn: () => unknown, timeout?: number) => void;

/** The globals of the test runner the suites call, typed without the types of a runner. */
type TestGlobals = {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => unknown, timeout?: number) => void;
  expect: (value: unknown) => Assertion;
  beforeEach: Hook;
  afterEach: Hook;
};

/**
 * Returns the globals of the test runner (Jest, Vitest or Bun), read when a suite is called, so the package needs the
 * types of none of them.
 */
export const runner = (): TestGlobals => globalThis as unknown as TestGlobals;
