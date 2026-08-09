/** The sort direction of a single field. */
export type SortDirection = 'asc' | 'desc';

/**
 * The sort value accepted for a single field of the sorted model. Scalar fields
 * take a sort direction, to-one relations take a nested sort object, and
 * to-many relations take a sort direction applied to their related record
 * count (the same as their `<relation>Count` field).
 */
export type SortValue<V> =
  NonNullable<V> extends Array<any>
    ? SortDirection
    : NonNullable<V> extends Date
      ? SortDirection
      : NonNullable<V> extends object
        ? QuerySortObject<NonNullable<V>>
        : SortDirection;

/**
 * A typed sort object for a resource model, mirroring the ORDER BY part of a
 * database query. The fields are applied in the order they are declared, and a
 * nested object sorts by a field of a to-one relation, which has to be included
 * in the response of the action the sort is applied on.
 *
 * @example
 * const sort: QuerySortObject<Post> = {
 *   author: { createdAt: 'desc' },
 *   tagsCount: 'desc',
 *   id: 'asc'
 * };
 */
export type QuerySortObject<T = any> = {
  [K in keyof T]?: SortValue<T[K]>;
};

/**
 * The sort input of a query or export action, accepted either as a
 * comma-separated field list, where a field prefixed with `-` is sorted in
 * descending order and a dot notation path targets a relation field
 * (i.e. `-author.createdAt, id`), or as a {@link QuerySortObject}.
 */
export type QuerySort<T = any> = string | QuerySortObject<T>;
