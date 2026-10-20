/** Creates the instance a contract suite tests, i.e. `() => new GcsStorage()`. */
export type ContractFactory<T> = () => T | Promise<T>;

/** Waits the given milliseconds. */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
