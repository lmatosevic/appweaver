import { ResourceModelConfig } from '@appweaver/common';
import { diffRecords, limit } from '../../../audit/utils/diff-util';

const config: ResourceModelConfig = {
  name: 'Post',
  scalars: {
    title: { type: 'string' },
    views: { type: 'int' },
    meta: { type: 'json' },
    note: { type: 'string', redact: true },
    internal: { type: 'string', hidden: true }
  },
  relations: {
    author: { model: 'User', type: 'manyToOne' },
    tags: { model: 'Tag', type: 'manyToMany' }
  },
  files: {
    cover: {}
  }
};

const options = { redactKeys: ['code'], maxValueSize: 64 };

describe('diff-util', () => {
  describe('diffRecords', () => {
    test('records the fields set on a create, without the empty ones and the database ones', () => {
      const diff = diffRecords(
        config,
        undefined,
        {
          id: 1,
          title: 'First',
          views: 0,
          meta: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        options
      );

      expect(diff).toEqual({ title: { to: 'First' }, views: { to: 0 } });
    });

    test('records the changed fields of an update', () => {
      const diff = diffRecords(
        config,
        { id: 1, title: 'First', views: 1, meta: { a: [1, 2] } },
        { id: 1, title: 'Second', views: 1, meta: { a: [1, 2] } },
        options
      );

      expect(diff).toEqual({ title: { from: 'First', to: 'Second' } });
    });

    test('records the fields of a deleted record', () => {
      expect(
        diffRecords(config, { id: 1, title: 'First' }, undefined, options)
      ).toEqual({ title: { from: 'First' } });
    });

    test('skips a field missing from one of the states', () => {
      expect(
        diffRecords(config, { id: 1, tags: [] }, { id: 1 }, options)
      ).toEqual({});
    });

    test('compares the relations and the files by the ids of their records', () => {
      const diff = diffRecords(
        config,
        {
          id: 1,
          author: { id: 1, email: 'a@test.com' },
          tags: [{ id: 10 }, { id: 2 }],
          cover: null
        },
        {
          id: 1,
          author: { id: 2, email: 'b@test.com' },
          tags: [{ id: 2 }, { id: 10 }],
          cover: { id: 5, name: 'cover.png' }
        },
        options
      );

      expect(diff).toEqual({
        author: { from: 1, to: 2 },
        cover: { from: null, to: 5 }
      });
    });

    test('redacts the redact and hidden fields, the secrets and the extra keys', () => {
      const diff = diffRecords(
        config,
        undefined,
        {
          id: 1,
          note: 'private',
          internal: 'hidden',
          passwordHash: 'hash',
          code: '123456',
          meta: { token: 'abc', label: 'x' }
        },
        options
      );

      expect(diff).toEqual({
        note: { to: '[Redacted]' },
        internal: { to: '[Redacted]' },
        passwordHash: { to: '[Redacted]' },
        code: { to: '[Redacted]' },
        meta: { to: { token: '[Redacted]', label: 'x' } }
      });
    });

    test('records that a redacted field changed', () => {
      expect(
        diffRecords(config, { id: 1, note: 'a' }, { id: 1, note: 'b' }, options)
      ).toEqual({ note: { from: '[Redacted]', to: '[Redacted]' } });
    });

    test('converts the values to their JSON form', () => {
      const diff = diffRecords(
        config,
        undefined,
        {
          id: 1,
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
          count: BigInt(10),
          data: new Uint8Array(4),
          price: { toJSON: () => '9.99' },
          list: [new Date('2026-01-02T00:00:00.000Z')]
        },
        options
      );

      expect(diff).toEqual({
        publishedAt: { to: '2026-01-01T00:00:00.000Z' },
        count: { to: '10' },
        data: { to: '[4 bytes]' },
        price: { to: '9.99' },
        list: { to: ['2026-01-02T00:00:00.000Z'] }
      });
    });

    test('truncates the long values', () => {
      const diff = diffRecords(
        config,
        undefined,
        { id: 1, title: 'x'.repeat(100), meta: { text: 'y'.repeat(100) } },
        options
      );

      expect(diff.title.to).toBe(`${'x'.repeat(64)}…`);
      expect(diff.meta.to).toBe('[Truncated: 111 characters]');
    });
  });

  describe('limit', () => {
    test('keeps the empty and the short values', () => {
      expect(limit(undefined, 10)).toBeUndefined();
      expect(limit(null, 10)).toBeNull();
      expect(limit({ a: 1 }, 10)).toEqual({ a: 1 });
    });
  });
});
