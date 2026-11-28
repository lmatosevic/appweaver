// The CommonJS resolution of TypeScript 5.9 (node10) ignores the `exports` of tsx, which hold the types of its API
declare module 'tsx/cjs/api' {
  /** Registers the CommonJS loader of TypeScript, returning a function unregistering it. */
  export function register(): () => void;
}
