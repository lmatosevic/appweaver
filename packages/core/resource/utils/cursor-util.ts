import {
  isArray,
  isPlainObject,
  makeHash,
  QueryResponse,
  ResourceId
} from '@appweaver/common';
import { HttpError } from '../../errors';

/** The cursors a query response carries, kept in step with the response contract. */
export type PageCursors = Pick<
  QueryResponse<unknown>,
  'nextCursor' | 'prevCursor'
>;

/** The part of a queried record a cursor is built from. */
type PagedRecord = { id: ResourceId };

/** A decoded cursor, holding the record it points at and the direction to page in. */
export type DecodedCursor = {
  id: ResourceId;
  /** True when the cursor pages towards the preceding records */
  backward: boolean;
};

/** The cursor payload, kept short since it is encoded into every cursor string. */
type CursorPayload = {
  /** Primary key of the record the page starts after */
  i: ResourceId;
  /** Fingerprint of the query the cursor was issued for */
  f: string;
  /** Set on a cursor paging towards the preceding records */
  b?: boolean;
};

/**
 * Builds the fingerprint identifying the query a cursor belongs to. A cursor
 * only yields the intended records while the resource, the query, and the order
 * stay the same, so it carries the fingerprint and is rejected on mismatch.
 *
 * @param {string} resourceName - The name of the queried model.
 * @param {Object} query - The mapped database query the cursor was issued for.
 * @param {Object[]} orderBy - The mapped order entries the cursor was issued for.
 * @return {string} The fingerprint of the query.
 */
export function queryFingerprint(
  resourceName: string,
  query: any,
  orderBy: any[]
): string {
  const serialized = stableStringify([resourceName, query ?? {}, orderBy]);
  return makeHash(serialized, 'sha256', 'base64url').slice(0, 16);
}

/**
 * Encodes the cursor of a page adjacent to a query result. The direction belongs
 * to the cursor rather than to the request, so a caller cannot pair one with a
 * direction it was not issued for.
 *
 * @param {ResourceId} id - The primary key of the record the page continues from.
 * @param {string} fingerprint - The fingerprint of the query, as built by
 * {@link queryFingerprint}.
 * @param {boolean} [backward] - Whether the cursor pages towards the preceding
 * records.
 * @return {string} The encoded cursor.
 */
export function encodeCursor(
  id: ResourceId,
  fingerprint: string,
  backward: boolean = false
): string {
  const payload: CursorPayload = { i: id, f: fingerprint };
  if (backward) {
    payload.b = true;
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Builds the cursors of the pages adjacent to a returned page, each addressing
 * the record of this page it continues from. A page that has no neighbour in a
 * direction, and an empty page, yield null rather than an absent cursor.
 *
 * @param {Object[]} resources - The records of the returned page, in the order
 * they were queried in.
 * @param {string} fingerprint - The fingerprint of the query the page belongs to.
 * @param {boolean} hasNext - Whether a page follows the returned one.
 * @param {boolean} hasPrev - Whether a page precedes the returned one.
 * @return {PageCursors} The cursors of the existing adjacent pages.
 */
export function pageCursors<T>(
  resources: T[],
  fingerprint: string,
  hasNext: boolean,
  hasPrev: boolean
): PageCursors {
  // A queried record always carries its primary key, which a model type need
  // not declare
  const first = resources[0] as PagedRecord | undefined;
  const last = resources[resources.length - 1] as PagedRecord | undefined;

  if (!first || !last) {
    return { nextCursor: null, prevCursor: null };
  }

  return {
    nextCursor: hasNext ? encodeCursor(last.id, fingerprint) : null,
    prevCursor: hasPrev ? encodeCursor(first.id, fingerprint, true) : null
  };
}

/**
 * Decodes the cursor a query request carries, resolving the record the page
 * continues from and the direction it runs in.
 *
 * @param {string} [cursor] - The cursor of the request, which may be the null
 * one of a page that does not exist.
 * @param {string} fingerprint - The fingerprint of the query the cursor is used
 * on, as built by {@link queryFingerprint}.
 * @return {DecodedCursor | undefined} The decoded cursor, or `undefined` when the
 * request carries none.
 * @throws {HttpError} 400 if the cursor is malformed, or was issued for another
 * resource, filter, or sort order.
 */
export function decodeCursor(
  cursor: string | null | undefined,
  fingerprint: string
): DecodedCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  let payload: CursorPayload | undefined;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (e) {
    throw new HttpError('Invalid pagination cursor', 400, e);
  }

  if (!isPlainObject(payload) || payload.i === undefined) {
    throw new HttpError('Invalid pagination cursor', 400);
  }

  if (payload.f !== fingerprint) {
    throw new HttpError(
      'Pagination cursor does not match the filter and sort of this query',
      400
    );
  }

  return { id: payload.i, backward: payload.b === true };
}

/**
 * Serializes a value with its object keys in a stable order, so two equal
 * queries fingerprint identically whatever order their properties arrived in.
 *
 * @param {any} value - The value to serialize.
 * @return {string} The serialized value.
 */
function stableStringify(value: any): string {
  if (isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
