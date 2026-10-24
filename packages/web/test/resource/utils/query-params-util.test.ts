import * as common from '@appweaver/common';
import { QueryMethod, ResourceError } from '@appweaver/common';
import {
  bulkRouteEnabled,
  parseJsonParams,
  queryRouteMethods
} from '../../../resource/utils/query-params-util';

describe('query-params-util', () => {
  describe('bulkRouteEnabled', () => {
    afterEach(() => {
      delete (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED;
      delete (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED;
      delete (common as any).configOverrides.RESOURCE_BULK_DELETE_ENABLED;
    });

    test('disables every bulk route by default', () => {
      expect(bulkRouteEnabled('bulkCreate')).toBe(false);
      expect(bulkRouteEnabled('bulkUpdate')).toBe(false);
      expect(bulkRouteEnabled('bulkReplace')).toBe(false);
      expect(bulkRouteEnabled('bulkDelete')).toBe(false);
    });

    test('follows the config of the resolved route', () => {
      (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED = true;

      expect(bulkRouteEnabled('bulkCreate')).toBe(false);
      expect(bulkRouteEnabled('bulkUpdate')).toBe(true);
      expect(bulkRouteEnabled('bulkReplace')).toBe(true);
      expect(bulkRouteEnabled('bulkDelete')).toBe(false);
    });
  });

  describe('queryRouteMethods', () => {
    afterEach(() => {
      delete (common as any).configOverrides.RESOURCE_QUERY_METHOD;
      delete (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD;
    });

    test('resolves the methods of every query method', () => {
      expect(queryRouteMethods('query', QueryMethod.Post)).toEqual({
        post: true,
        get: false
      });
      expect(queryRouteMethods('query', QueryMethod.Get)).toEqual({
        post: false,
        get: true
      });
      expect(queryRouteMethods('query', QueryMethod.GetPost)).toEqual({
        post: true,
        get: true
      });
    });

    test('accepts the plain string values', () => {
      expect(queryRouteMethods('aggregate', 'get-post')).toEqual({
        post: true,
        get: true
      });
    });

    test('defaults to the POST route only', () => {
      expect(queryRouteMethods('query')).toEqual({ post: true, get: false });
      expect(queryRouteMethods('aggregate')).toEqual({
        post: true,
        get: false
      });
    });

    test('falls back to the config of the resolved route', () => {
      (common as any).configOverrides.RESOURCE_QUERY_METHOD = QueryMethod.Get;
      (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD =
        QueryMethod.GetPost;

      expect(queryRouteMethods('query')).toEqual({ post: false, get: true });
      expect(queryRouteMethods('aggregate')).toEqual({ post: true, get: true });
    });

    test('prefers the route method over the config', () => {
      (common as any).configOverrides.RESOURCE_QUERY_METHOD = QueryMethod.Get;

      expect(queryRouteMethods('query', QueryMethod.Post)).toEqual({
        post: true,
        get: false
      });
    });
  });

  describe('parseJsonParams', () => {
    test('parses the JSON fields', () => {
      const query: Record<string, unknown> = {
        filter: '{"views":{"_gte":10}}',
        select: '{"views":{"sum":true}}',
        page: '2'
      };

      parseJsonParams(query, ['filter', 'select']);

      expect(query).toEqual({
        filter: { views: { _gte: 10 } },
        select: { views: { sum: true } },
        page: '2'
      });
    });

    test('keeps a JSON value that is not an object for the validation to reject', () => {
      const query: Record<string, unknown> = { filter: '[1]' };

      parseJsonParams(query, ['filter']);

      expect(query.filter).toEqual([1]);
    });

    test('leaves the missing fields out', () => {
      const query: Record<string, unknown> = { page: '1' };

      parseJsonParams(query, ['filter'], ['sort']);

      expect(query).toEqual({ page: '1' });
    });

    test('parses an object field given as a JSON object', () => {
      const query: Record<string, unknown> = { sort: ' {"views":"desc"}' };

      parseJsonParams(query, [], ['sort']);

      expect(query.sort).toEqual({ views: 'desc' });
    });

    test('leaves an object field given as a plain string', () => {
      const query: Record<string, unknown> = { sort: '-createdAt,id' };

      parseJsonParams(query, [], ['sort']);

      expect(query.sort).toBe('-createdAt,id');
    });

    test('rejects malformed JSON', () => {
      expect(() => parseJsonParams({ filter: '{views' }, ['filter'])).toThrow(
        ResourceError
      );
      expect(() => parseJsonParams({ filter: 'views' }, ['filter'])).toThrow(
        "Query parameter 'filter' is not valid JSON"
      );
      expect(() => parseJsonParams({ sort: '{views' }, [], ['sort'])).toThrow(
        "Query parameter 'sort' is not valid JSON"
      );
    });

    test('rejects a repeated field', () => {
      let error: ResourceError | undefined;
      try {
        parseJsonParams({ filter: ['{}', '{}'] }, ['filter']);
      } catch (e) {
        error = e as ResourceError;
      }

      expect(error).toBeInstanceOf(ResourceError);
      expect(error?.code).toBe(common.ErrorCode.ResourceInvalidQueryParameter);
      expect(error?.message).toContain("'filter' is repeated");
    });
  });
});
