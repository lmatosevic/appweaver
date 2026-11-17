/**
 * A type made readonly at every depth: its properties, arrays, maps and sets. The values changed only through their
 * own methods (dates, regular expressions, binary data, decimals) and the functions are kept as they are.
 */
export type DeepReadonly<T> = 0 extends 1 & T
  ? T
  : T extends
        | ((...args: any[]) => any)
        | Date
        | RegExp
        | Uint8Array
        | { toNumber(): number }
    ? T
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<K, DeepReadonly<V>>
      : T extends ReadonlySet<infer V>
        ? ReadonlySet<DeepReadonly<V>>
        : T extends readonly (infer V)[]
          ? readonly DeepReadonly<V>[]
          : T extends object
            ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
            : T;
