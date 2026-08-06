/** A primitive value that can be compared inside a query filter. */
export type FilterScalar = string | number | boolean | Date;

/**
 * Comparison operators applicable to a single scalar field. Multiple operators
 * can be combined inside one object, in which case all of them must match.
 */
export type FilterOperators<V = FilterScalar> = {
  /** Matches values equal to the given value */
  _eq?: V | null;
  /** Matches values not equal to the given value */
  _ne?: V | null;
  /** Matches values greater than the given value */
  _gt?: V;
  /** Matches values greater than or equal to the given value */
  _gte?: V;
  /** Matches values lower than the given value */
  _lt?: V;
  /** Matches values lower than or equal to the given value */
  _lte?: V;
  /** Matches values included in the given list */
  _in?: V[];
  /** Matches values not included in the given list */
  _nin?: V[];
  /** Matches values inside the inclusive `[min, max]` range */
  _between?: [V, V];
  /** Matches strings against an SQL LIKE pattern with `%` wildcards
   * (i.e. `Luk%`, `%avatar%`) */
  _like?: string;
  /** Case-insensitive variant of the `_like` operator */
  _ilike?: string;
  /** Matches strings starting with the given value */
  _starts?: string;
  /** Matches strings ending with the given value */
  _ends?: string;
  /** Matches strings containing the given value */
  _contains?: string;
  /** Matches values that are not null (`true`) or null (`false`) */
  _exists?: boolean;
  /** Negates the nested operators */
  _not?: FilterOperators<V> | V;
};

/**
 * Operators applicable to a scalar list (array) field.
 */
export type ArrayFilterOperators<V = FilterScalar> = {
  /** Matches lists containing the given value */
  _has?: V;
  /** Matches lists containing at least one of the given values */
  _hasSome?: V[];
  /** Matches lists containing all the given values */
  _hasEvery?: V[];
  /** Matches empty (`true`) or non-empty (`false`) lists */
  _isEmpty?: boolean;
  /** Matches values that are not null (`true`) or null (`false`) */
  _exists?: boolean;
};

/**
 * Operators applicable to a list (to-many) relation field.
 */
export type RelationFilterOperators<T> = {
  /** Matches records where at least one related record matches the filter */
  _some?: QueryFilter<T>;
  /** Matches records where every related record matches the filter */
  _every?: QueryFilter<T>;
  /** Matches records where no related record matches the filter */
  _none?: QueryFilter<T>;
  /** Matches records with at least one related record (`true`) or without
   * related records (`false`) */
  _exists?: boolean;
};

/**
 * The filter value accepted for a single field of the filtered model. Besides
 * the operator objects, plain values are still supported: a bare value matches
 * by equality, a list of values by inclusion (or as an inclusive `[min, max]`
 * range for numeric and date fields), a bare value or list on a relation
 * matches by id, and a nested object filters the related model recursively.
 */
export type FilterValue<V> =
  NonNullable<V> extends Array<infer E>
    ? NonNullable<E> extends object
      ?
          | QueryFilter<NonNullable<E>>
          | QueryFilter<NonNullable<E>>[]
          | RelationFilterOperators<NonNullable<E>>
          | number
          | number[]
          | null
      : ArrayFilterOperators<NonNullable<E>> | E | E[] | null
    : NonNullable<V> extends Date
      ?
          | Date
          | string
          | (Date | string)[]
          | FilterOperators<Date | string>
          | null
      : NonNullable<V> extends object
        ?
            | QueryFilter<NonNullable<V>>
            | FilterOperators<never>
            | number
            | number[]
            | null
        : V | NonNullable<V>[] | FilterOperators<NonNullable<V>> | null;

/**
 * A typed query filter for a resource model, mirroring the WHERE part of a
 * database query. Field conditions given as sibling properties must all match,
 * while the logical operators combine their nested conditions with the
 * matching logical connective. The nested conditions can be given either as a
 * single object whose entries are combined per key, or as a list of filter
 * objects.
 *
 * @example
 * const filter: QueryFilter<User> = {
 *   _and: {
 *     firstName: { _eq: 'Luka', _exists: true },
 *     avatar: { title: { _like: '%avatar%' } }
 *   },
 *   _or: [{ firstName: { _like: 'Luk%' } }, { lastName: 'Matošević' }]
 * };
 */
export type QueryFilter<T = any> = {
  /** Matches records satisfying all the nested conditions */
  _and?: QueryFilter<T> | QueryFilter<T>[];
  /** Matches records satisfying at least one nested condition */
  _or?: QueryFilter<T> | QueryFilter<T>[];
  /** Matches records satisfying none of the nested conditions */
  _not?: QueryFilter<T> | QueryFilter<T>[];
  /** Matches records satisfying none of the nested conditions (alias of `_not`) */
  _nor?: QueryFilter<T> | QueryFilter<T>[];
  /** Full-text search input resolved by the resource service */
  searchText?: string;
} & {
  [K in keyof T]?: FilterValue<T[K]>;
};
