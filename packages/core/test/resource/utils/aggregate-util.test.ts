import { ResourceClient } from '@appweaver/common';
import { createModel } from '../../../factory/create-model';
import {
  aggregateFields,
  aggregationRecordCount,
  checkAggregationDateField,
  mapAggregationResult,
  mapAggregationSelect,
  readAggregationBoundaries
} from '../../../resource/utils/aggregate-util';
import { resetContext } from '../../fixtures/context-fixture';
import { linkModels } from '../../fixtures/model-fixture';

describe('aggregate-util', () => {
  /** Maps a selection against the Post model defined below. */
  const operations = (select: any): any => mapAggregationSelect(select, 'Post');

  /** The database aggregation arguments a selection maps to. */
  const map = (select: any): any => operations(select).aggregate;

  beforeEach(() => {
    resetContext();

    createModel({
      name: 'User',
      scalars: { email: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        views: { type: 'int' },
        rating: { type: 'float' },
        publishedAt: { type: 'dateTime' },
        enabled: { type: 'boolean' },
        scores: { type: 'int', array: true },
        secret: { type: 'int', hidden: true }
      },
      virtual: {
        score: { type: 'float', output: { value: () => 1 } }
      },
      relations: {
        author: { model: 'User', type: 'oneToMany', owner: true }
      }
    });

    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('mapAggregationSelect', () => {
    test('maps the operators of a numeric field', () => {
      expect(map({ views: { count: true, sum: true, avg: true } })).toEqual({
        _count: { views: true },
        _sum: { views: true },
        _avg: { views: true }
      });
    });

    test('maps the operators of several fields into one argument each', () => {
      expect(map({ views: { sum: true }, rating: { sum: true } })).toEqual({
        _sum: { views: true, rating: true }
      });
    });

    test('maps the operators of a date field', () => {
      expect(
        map({ publishedAt: { count: true, min: true, max: true } })
      ).toEqual({
        _count: { publishedAt: true },
        _min: { publishedAt: true },
        _max: { publishedAt: true }
      });
    });

    test('maps the id and audit fields', () => {
      expect(map({ id: { count: true }, createdAt: { max: true } })).toEqual({
        _count: { id: true },
        _max: { createdAt: true }
      });
    });

    test('leaves out the operators that are not enabled', () => {
      expect(map({ views: { sum: true, avg: false } })).toEqual({
        _sum: { views: true }
      });
    });

    test('throws for an empty selection', () => {
      expect(() => map({})).toThrow(
        /requires at least one field with a selected aggregation operator/
      );
      expect(() => map({ views: { sum: false } })).toThrow(
        /requires at least one field with a selected aggregation operator/
      );
    });

    test('throws for a selection that is not an object', () => {
      expect(() => map(undefined)).toThrow(
        /select must be an object of fields to aggregate/
      );
      expect(() => map('views')).toThrow(
        /select must be an object of fields to aggregate/
      );
    });

    test('throws for a field value that is not an object', () => {
      expect(() => map({ views: true })).toThrow(
        /its value must be an object of aggregation operators/
      );
    });

    test('throws for an unknown field', () => {
      expect(() => map({ unknown: { count: true } })).toThrow(
        /'unknown' field, it is not a numeric or date field of the Post model/
      );
    });

    test('throws for a non-numeric and non-date field', () => {
      expect(() => map({ title: { count: true } })).toThrow(
        /not a numeric or date field/
      );
      expect(() => map({ enabled: { count: true } })).toThrow(
        /not a numeric or date field/
      );
    });

    test('throws for a relation field', () => {
      expect(() => map({ author: { count: true } })).toThrow(
        /not a numeric or date field/
      );
    });

    test('throws for a hidden, array, or virtual field', () => {
      expect(() => map({ secret: { sum: true } })).toThrow(
        /not a numeric or date field/
      );
      expect(() => map({ scores: { sum: true } })).toThrow(
        /not a numeric or date field/
      );
      expect(() => map({ score: { avg: true } })).toThrow(
        /not a numeric or date field/
      );
    });

    test('throws for an unknown operator', () => {
      expect(() => map({ views: { median: true } })).toThrow(
        /Cannot apply the 'median' operator to the numeric field 'views'/
      );
    });

    test('throws for summing or averaging a date field', () => {
      expect(() => map({ publishedAt: { sum: true } })).toThrow(
        /Cannot apply the 'sum' operator to the date field 'publishedAt', expected one of: count, min, max/
      );
      expect(() => map({ publishedAt: { avg: true } })).toThrow(
        /Cannot apply the 'avg' operator to the date field 'publishedAt'/
      );
    });

    test('throws with a bad request status code', () => {
      expect(() => map({ unknown: { count: true } })).toThrow(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('mapAggregationSelect boundary operators', () => {
    test('collects the fields of the first and last operators', () => {
      expect(
        operations({
          views: { first: true, last: true },
          publishedAt: { first: true }
        })
      ).toMatchObject({
        first: ['views', 'publishedAt'],
        last: ['views']
      });
    });

    test('counts the records of the range to skip the empty ones', () => {
      expect(operations({ views: { first: true } }).aggregate).toEqual({
        _count: { _all: true }
      });
    });

    test('keeps the database aggregations alongside the boundary fields', () => {
      const result = operations({
        views: { sum: true, first: true },
        rating: { avg: true }
      });

      expect(result.aggregate).toEqual({
        _sum: { views: true },
        _avg: { rating: true },
        _count: { _all: true }
      });
      expect(result.first).toEqual(['views']);
      expect(result.last).toEqual([]);
    });

    test('does not count the records without a boundary field', () => {
      expect(operations({ views: { sum: true } })).toEqual({
        aggregate: { _sum: { views: true } },
        first: [],
        last: []
      });
    });

    test('leaves out the boundary operators that are not enabled', () => {
      expect(
        operations({ views: { sum: true, first: false, last: false } })
      ).toEqual({ aggregate: { _sum: { views: true } }, first: [], last: [] });
    });

    test('throws when only disabled boundary operators are selected', () => {
      expect(() => operations({ views: { first: false } })).toThrow(
        /requires at least one field with a selected aggregation operator/
      );
    });
  });

  describe('mapAggregationResult', () => {
    test('swaps the operator and field nesting', () => {
      expect(
        mapAggregationResult({ _count: { id: 4 }, _sum: { views: 8 } })
      ).toEqual({ id: { count: 4 }, views: { sum: 8 } });
    });

    test('keeps every operator of the same field', () => {
      expect(
        mapAggregationResult({ _min: { views: 1 }, _max: { views: 9 } })
      ).toEqual({ views: { min: 1, max: 9 } });
    });

    test('returns an empty value for an empty result', () => {
      expect(mapAggregationResult({})).toEqual({});
    });

    test('maps the boundary record values', () => {
      expect(
        mapAggregationResult({
          _first: { views: 1, publishedAt: null },
          _last: { views: 9, publishedAt: null }
        })
      ).toEqual({
        views: { first: 1, last: 9 },
        publishedAt: { first: null, last: null }
      });
    });

    test('leaves out the record count of the range', () => {
      expect(mapAggregationResult({ _count: { _all: 3, views: 2 } })).toEqual({
        views: { count: 2 }
      });
    });
  });

  describe('aggregationRecordCount', () => {
    test('reads the counted records of a range', () => {
      expect(aggregationRecordCount({ _count: { _all: 3 } })).toBe(3);
      expect(aggregationRecordCount({ _count: { _all: 0 } })).toBe(0);
    });

    test('returns undefined when the range was not counted', () => {
      expect(aggregationRecordCount({ _sum: { views: 8 } })).toBeUndefined();
      expect(aggregationRecordCount({ _count: { views: 2 } })).toBeUndefined();
      expect(aggregationRecordCount({})).toBeUndefined();
    });
  });

  describe('readAggregationBoundaries', () => {
    const where = { AND: [{ id: 1 }] };

    /** A model client stub returning the given record from every lookup. */
    const client = (record: any = null): ResourceClient =>
      ({
        name: 'Post',
        findFirst: jest.fn().mockResolvedValue(record)
      }) as unknown as ResourceClient;

    test('reads no record when no boundary field is selected', async () => {
      const stub = client();

      await expect(
        readAggregationBoundaries(stub, where, 'createdAt', {
          aggregate: {},
          first: [],
          last: []
        })
      ).resolves.toEqual({});
      expect(stub.findFirst).not.toHaveBeenCalled();
    });

    test('orders the earliest record by the aggregated date field', async () => {
      const stub = client({ views: 3 });

      const result = await readAggregationBoundaries(
        stub,
        where,
        'publishedAt',
        { aggregate: {}, first: ['views'], last: [] }
      );

      expect(stub.findFirst).toHaveBeenCalledWith({
        where,
        orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
        select: { views: true }
      });
      expect(result).toEqual({ _first: { views: 3 } });
    });

    test('orders the latest record in the opposite direction', async () => {
      const stub = client({ views: 9 });

      const result = await readAggregationBoundaries(
        stub,
        where,
        'publishedAt',
        { aggregate: {}, first: [], last: ['views'] }
      );

      expect(stub.findFirst).toHaveBeenCalledWith({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        select: { views: true }
      });
      expect(result).toEqual({ _last: { views: 9 } });
    });

    test('reads both boundary records with their own fields', async () => {
      const stub = client({ views: 3, rating: 1.5 });

      const result = await readAggregationBoundaries(stub, where, 'createdAt', {
        aggregate: {},
        first: ['views', 'rating'],
        last: ['views']
      });

      expect(stub.findFirst).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        _first: { views: 3, rating: 1.5 },
        _last: { views: 3 }
      });
    });

    test('resolves the values of an empty range without a lookup', async () => {
      const stub = client({ views: 3 });

      const result = await readAggregationBoundaries(
        stub,
        where,
        'createdAt',
        { aggregate: {}, first: ['views'], last: ['views'] },
        0
      );

      expect(stub.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({
        _first: { views: null },
        _last: { views: null }
      });
    });

    test('reads the range when its record count is unknown', async () => {
      const stub = client({ views: 3 });

      await readAggregationBoundaries(
        stub,
        where,
        'createdAt',
        { aggregate: {}, first: ['views'], last: [] },
        undefined
      );

      expect(stub.findFirst).toHaveBeenCalledTimes(1);
    });

    test('resolves a missing record value to null', async () => {
      const stub = client(null);

      const result = await readAggregationBoundaries(
        stub,
        where,
        'createdAt',
        { aggregate: {}, first: ['views'], last: [] },
        1
      );

      expect(result).toEqual({ _first: { views: null } });
    });
  });

  describe('checkAggregationDateField', () => {
    test('accepts a date field of the model', () => {
      expect(checkAggregationDateField('publishedAt', 'Post')).toBe(
        'publishedAt'
      );
      expect(checkAggregationDateField('createdAt', 'Post')).toBe('createdAt');
    });

    test('throws for a field that is not a date field', () => {
      expect(() => checkAggregationDateField('views', 'Post')).toThrow(
        /'views' field, it is not a date field of the Post model, expected one of: updatedAt, createdAt, publishedAt/
      );
    });

    test('throws for a date field the model does not audit', () => {
      createModel(
        {
          name: 'Post',
          audit: { createdAt: false },
          scalars: { views: { type: 'int' } }
        },
        true
      );
      linkModels();

      expect(() => checkAggregationDateField('createdAt', 'Post')).toThrow(
        /not a date field of the Post model/
      );
    });
  });

  describe('aggregateFields', () => {
    test('lists the numeric and date fields of a model', () => {
      const model = createModel(
        {
          name: 'Draft',
          scalars: {
            title: { type: 'string' },
            views: { type: 'int' },
            publishedAt: { type: 'dateTime' }
          }
        },
        true
      );

      expect(aggregateFields(model)).toEqual([
        ['id', 'numeric'],
        ['updatedAt', 'date'],
        ['createdAt', 'date'],
        ['createdById', 'numeric'],
        ['views', 'numeric'],
        ['publishedAt', 'date']
      ]);
    });

    test('leaves out a string id and the disabled audit fields', () => {
      const model = createModel(
        {
          name: 'Draft',
          id: { type: 'string' },
          audit: { updatedAt: false, createdById: false },
          scalars: { views: { type: 'int' } }
        },
        true
      );

      expect(aggregateFields(model)).toEqual([
        ['createdAt', 'date'],
        ['views', 'numeric']
      ]);
    });
  });
});
