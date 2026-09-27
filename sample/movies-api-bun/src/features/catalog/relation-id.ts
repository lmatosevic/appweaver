/** The id of a relation input given either as the id or as `{ id }`. */
export function relationId<T extends string | number>(value: T | { id: T }): T {
  return typeof value === 'object' ? value.id : value;
}
