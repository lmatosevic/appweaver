import {
  decodeCursor,
  encodeCursor,
  pageCursors,
  queryFingerprint
} from '../../../resource/utils/cursor-util';

describe('cursor-util', () => {
  const fingerprint = queryFingerprint('Post', { views: 10 }, [
    { createdAt: 'desc' }
  ]);

  describe('queryFingerprint', () => {
    test('returns the same fingerprint for an equal query', () => {
      expect(queryFingerprint('Post', { views: 10 }, [{ id: 'asc' }])).toBe(
        queryFingerprint('Post', { views: 10 }, [{ id: 'asc' }])
      );
    });

    test('ignores the order the filter properties were received in', () => {
      expect(
        queryFingerprint('Post', { views: 10, title: 'a' }, [{ id: 'asc' }])
      ).toBe(
        queryFingerprint('Post', { title: 'a', views: 10 }, [{ id: 'asc' }])
      );
    });

    test('treats a missing filter as an empty one', () => {
      expect(queryFingerprint('Post', undefined, [])).toBe(
        queryFingerprint('Post', {}, [])
      );
    });

    test('differs for another resource, filter, or order', () => {
      const base = queryFingerprint('Post', { views: 10 }, [{ id: 'asc' }]);

      expect(queryFingerprint('User', { views: 10 }, [{ id: 'asc' }])).not.toBe(
        base
      );
      expect(queryFingerprint('Post', { views: 20 }, [{ id: 'asc' }])).not.toBe(
        base
      );
      expect(
        queryFingerprint('Post', { views: 10 }, [{ id: 'desc' }])
      ).not.toBe(base);
    });
  });

  describe('encodeCursor', () => {
    test('encodes the id and the fingerprint into a url safe string', () => {
      const cursor = encodeCursor(42, fingerprint);

      expect(cursor).toMatch(/^[\w-]+$/);
      expect(JSON.parse(Buffer.from(cursor, 'base64url').toString())).toEqual({
        i: 42,
        f: fingerprint
      });
    });

    test('marks a backward cursor in its payload', () => {
      const cursor = encodeCursor(42, fingerprint, true);

      expect(JSON.parse(Buffer.from(cursor, 'base64url').toString())).toEqual({
        i: 42,
        f: fingerprint,
        b: true
      });
    });

    test('encodes a string id', () => {
      const cursor = encodeCursor('a1b2c3', fingerprint);

      expect(decodeCursor(cursor, fingerprint)).toEqual({
        id: 'a1b2c3',
        backward: false
      });
    });
  });

  describe('decodeCursor', () => {
    test('returns undefined without a cursor', () => {
      expect(decodeCursor(undefined, fingerprint)).toBeUndefined();
      expect(decodeCursor('', fingerprint)).toBeUndefined();
    });

    test('reads the direction back off the cursor', () => {
      expect(decodeCursor(encodeCursor(7, fingerprint), fingerprint)).toEqual({
        id: 7,
        backward: false
      });
      expect(
        decodeCursor(encodeCursor(7, fingerprint, true), fingerprint)
      ).toEqual({ id: 7, backward: true });
    });

    test('rejects a cursor issued for another query', () => {
      const other = queryFingerprint('Post', { views: 20 }, []);

      expect(() => decodeCursor(encodeCursor(7, other), fingerprint)).toThrow(
        'does not match the filter and sort'
      );
    });

    test('rejects a malformed cursor', () => {
      expect(() => decodeCursor('not-a-cursor', fingerprint)).toThrow(
        'Invalid pagination cursor'
      );
    });

    test('rejects a cursor without an id', () => {
      const cursor = Buffer.from(JSON.stringify({ f: fingerprint })).toString(
        'base64url'
      );

      expect(() => decodeCursor(cursor, fingerprint)).toThrow(
        'Invalid pagination cursor'
      );
    });

    test('rejects a cursor holding a value that is not an object', () => {
      const cursor = Buffer.from('"plain"').toString('base64url');

      expect(() => decodeCursor(cursor, fingerprint)).toThrow(
        'Invalid pagination cursor'
      );
    });
  });

  describe('pageCursors', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    test('anchors the next cursor on the last record of the page', () => {
      const { nextCursor } = pageCursors(items, fingerprint, true, false);

      expect(decodeCursor(nextCursor, fingerprint)).toEqual({
        id: 3,
        backward: false
      });
    });

    test('anchors the prev cursor on the first record of the page', () => {
      const { prevCursor } = pageCursors(items, fingerprint, false, true);

      expect(decodeCursor(prevCursor, fingerprint)).toEqual({
        id: 1,
        backward: true
      });
    });

    test('nulls the cursor of a page that does not exist', () => {
      expect(pageCursors(items, fingerprint, false, false)).toEqual({
        nextCursor: null,
        prevCursor: null
      });
    });

    test('returns both cursors for a page between two others', () => {
      const cursors = pageCursors(items, fingerprint, true, true);

      expect(cursors.nextCursor).toBeDefined();
      expect(cursors.prevCursor).toBeDefined();
      expect(cursors.nextCursor).not.toBe(cursors.prevCursor);
    });

    test('yields null cursors for an empty page', () => {
      expect(pageCursors([], fingerprint, true, true)).toEqual({
        nextCursor: null,
        prevCursor: null
      });
    });

    test('anchors both cursors on the same single record', () => {
      const cursors = pageCursors([{ id: 7 }], fingerprint, true, true);

      expect(decodeCursor(cursors.nextCursor, fingerprint)).toEqual({
        id: 7,
        backward: false
      });
      expect(decodeCursor(cursors.prevCursor, fingerprint)).toEqual({
        id: 7,
        backward: true
      });
    });
  });
});
