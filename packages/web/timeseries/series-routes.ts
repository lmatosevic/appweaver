import {
  ErrorCode,
  ResourceError,
  ResourceId,
  RouteConfig,
  SeriesAggregate,
  SeriesOrder,
  SeriesPoint,
  SeriesWriteRouteConfig,
  TimeSeriesError
} from '@appweaver/common';
import {
  CacheService,
  currentAuthUser,
  inject,
  injectPolicy,
  injectService,
  SeriesPointInput,
  TimeSeriesService,
  timeseriesConfig
} from '@appweaver/core';
import { Server } from '../types/server';

/** The action on the series of a resource, checked by its policy. */
type SeriesAction = 'read' | 'write' | 'delete';

const POLICY_CHECKS = {
  read: 'canRead',
  write: 'canWrite',
  delete: 'canDelete'
} as const;

type SeriesRouteSchemas = {
  seriesWriteSchema: object;
  seriesBulkWriteSchema: object;
  seriesQuerySchema: object;
  seriesBulkQuerySchema: object;
  seriesDeleteSchema: object;
};

type SeriesRouteConfigs = {
  seriesWrite?: SeriesWriteRouteConfig & object;
  seriesQuery?: RouteConfig & object;
  seriesDelete?: RouteConfig & object;
};

/** A point of a write request, its values beside its time. */
type PointBody = Record<string, unknown> & {
  time?: string | number;
  resourceId?: ResourceId;
};

type QueryParams = {
  fields?: string | string[];
  from?: string;
  to?: string;
  bucket?: string;
  aggregate?: SeriesAggregate;
  order?: SeriesOrder;
  limit?: number;
};

/**
 * Registers the time series routes of a model with `series` fields: the write, query and delete of the points of a
 * resource, and the write and query of the points of many. Every route reads the resources through their resource
 * service, so the policies of the model apply, then checks its `series` policy.
 *
 * @param {Server} server - The server the routes of the model are registered on.
 * @param {string} name - The model name.
 * @param {SeriesRouteSchemas} schema - The route schemas.
 * @param {SeriesRouteConfigs} configs - The config of each route.
 * @param {Function} routeAuth - The authentication and bot check hooks of a route config.
 */
export function registerSeriesRoutes(
  server: Server,
  name: string,
  schema: SeriesRouteSchemas,
  configs: SeriesRouteConfigs,
  routeAuth: (config: RouteConfig | undefined) => unknown[]
): void {
  const timeSeries = () => inject(TimeSeriesService);
  const { seriesWrite, seriesQuery, seriesDelete } = configs;

  if (!seriesWrite?.exclude) {
    const write = async (
      reply: any,
      points: SeriesPointInput[],
      ingest?: 'direct'
    ) => {
      const result = await timeSeries().write(name, points, {
        ingest: seriesWrite?.allowDirect === false ? undefined : ingest,
        maxPoints: seriesWrite?.maxPoints
      });
      return reply.code(result.queued ? 202 : 200).send(result);
    };

    server.post<{
      Params: { id: ResourceId };
      Body: { points: PointBody[] };
      Querystring: { ingest?: 'direct' };
    }>(
      '/:id/series',
      {
        schema: schema.seriesWriteSchema,
        onRequest: routeAuth(seriesWrite) as any,
        config: seriesWrite
      },
      async (request, reply) => {
        const id = request.params.id;
        await checkedResources(name, [id], 'write');
        return write(
          reply,
          request.body.points.map((point) => toPointInput(id, point)),
          request.query.ingest
        );
      }
    );

    server.post<{
      Body: { points: PointBody[] };
      Querystring: { ingest?: 'direct' };
    }>(
      '/series',
      {
        schema: schema.seriesBulkWriteSchema,
        onRequest: routeAuth(seriesWrite) as any,
        config: seriesWrite
      },
      async (request, reply) => {
        const ids = unique(
          request.body.points.map((point) => point.resourceId!)
        );
        await checkedResources(name, ids, 'write');
        return write(
          reply,
          request.body.points.map((point) =>
            toPointInput(point.resourceId!, point)
          ),
          request.query.ingest
        );
      }
    );
  }

  if (!seriesQuery?.exclude) {
    server.get<{ Params: { id: ResourceId }; Querystring: QueryParams }>(
      '/:id/series',
      {
        schema: schema.seriesQuerySchema,
        onRequest: routeAuth(seriesQuery) as any,
        config: seriesQuery
      },
      async (request, reply) => {
        const id = request.params.id;
        await checkedResources(name, [id], 'read');
        const points = await timeSeries().query(name, {
          ...queryOptions(request.query),
          resourceIds: [id]
        });
        return reply.send({
          items: points.map((point) => toPointOutput(point, false))
        });
      }
    );

    server.post<{
      Body: QueryParams & {
        ids?: ResourceId[];
        filter?: Record<string, unknown>;
      };
    }>(
      '/series/query',
      {
        schema: schema.seriesBulkQuerySchema,
        onRequest: routeAuth(seriesQuery) as any,
        config: seriesQuery
      },
      async (request, reply) => {
        const { ids, filter, ...query } = request.body;
        const resourceIds = await matchingResources(name, ids, filter);
        const points = await timeSeries().query(name, {
          ...queryOptions(query),
          resourceIds
        });
        return reply.send({
          items: points.map((point) => toPointOutput(point, true))
        });
      }
    );
  }

  if (!seriesDelete?.exclude) {
    server.post<{
      Params: { id: ResourceId };
      Body: { from?: string; to?: string };
    }>(
      '/:id/delete-series',
      {
        schema: schema.seriesDeleteSchema,
        onRequest: routeAuth(seriesDelete) as any,
        config: seriesDelete
      },
      async (request, reply) => {
        const id = request.params.id;
        await checkedResources(name, [id], 'delete');
        const count = await timeSeries().delete(name, {
          resourceIds: [id],
          from: request.body.from,
          to: request.body.to
        });
        return reply.send({ count });
      }
    );
  }
}

/**
 * Reads the resources through their service, so the policies of the model apply, and checks the `series` policy of
 * the action on each, keeping an allowed check for `timeseries.accessCacheTtl` milliseconds.
 *
 * @throws {ResourceError} `RESOURCE_NOT_FOUND` for a resource that is not found or not readable.
 * @throws {TimeSeriesError} `TIMESERIES_FORBIDDEN` when the series policy denies the action.
 */
async function checkedResources(
  name: string,
  ids: ResourceId[],
  action: SeriesAction
): Promise<void> {
  if (ids.length > timeseriesConfig.MAX_RESOURCES_PER_QUERY) {
    throw new TimeSeriesError(
      ErrorCode.TimeSeriesTooManyResources,
      `A time series write covers up to ${timeseriesConfig.MAX_RESOURCES_PER_QUERY} resources`,
      { maxResources: timeseriesConfig.MAX_RESOURCES_PER_QUERY }
    );
  }

  const ttl = timeseriesConfig.ACCESS_CACHE_TTL;
  const cache = ttl > 0 ? inject(CacheService, false) : undefined;
  const user = currentAuthUser() ?? null;
  const key = (id: ResourceId) =>
    `timeseries-access:${name}:${action}:${user?.id ?? '-'}:${id}`;

  const unchecked: ResourceId[] = [];
  for (const id of ids) {
    if (!cache || (await cache.getCachedValue<boolean>(key(id))) !== true) {
      unchecked.push(id);
    }
  }
  if (unchecked.length === 0) {
    return;
  }

  const service = injectService(name);
  const resources =
    unchecked.length === 1
      ? [await service.find(unchecked[0])]
      : (
          await service.query({
            filter: { id: { _in: unchecked } },
            size: unchecked.length,
            sort: 'id',
            totalCount: false
          })
        ).items;

  const found = new Set(resources.map((resource: any) => String(resource.id)));
  const missing = unchecked.find((id) => !found.has(String(id)));
  if (missing !== undefined) {
    throw new ResourceError(ErrorCode.ResourceNotFound, `${name} not found`, {
      model: name,
      id: missing
    });
  }

  const check = injectPolicy(name, false)?.series?.[POLICY_CHECKS[action]];
  for (const resource of resources) {
    if (check && (await check(user, resource)) === false) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesForbidden,
        `${name} time series ${action} is forbidden`,
        { model: name, action }
      );
    }
    await cache?.addToCache(key(resource.id), true, ttl, true);
  }
}

/** The ids of the resources of a query of many, by their ids, a filter, or both, checked for the read action. */
async function matchingResources(
  name: string,
  ids: ResourceId[] | undefined,
  filter: Record<string, unknown> | undefined
): Promise<ResourceId[]> {
  const max = timeseriesConfig.MAX_RESOURCES_PER_QUERY;
  if (ids && !filter) {
    await checkedResources(name, unique(ids), 'read');
    return unique(ids);
  }

  const conditions = [
    filter ?? {},
    ...(ids ? [{ id: { _in: unique(ids) } }] : [])
  ];
  const { items } = await injectService(name).query({
    filter: conditions.length > 1 ? { _and: conditions } : conditions[0],
    size: max + 1,
    sort: 'id',
    totalCount: false
  });
  if (items.length > max) {
    throw new TimeSeriesError(
      ErrorCode.TimeSeriesTooManyResources,
      `A time series query covers up to ${max} resources`,
      { maxResources: max }
    );
  }

  const matched = items.map((item: any) => item.id as ResourceId);
  await checkedResources(name, matched, 'read');
  return matched;
}

function queryOptions(query: QueryParams) {
  const fields =
    typeof query.fields === 'string'
      ? query.fields
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean)
      : query.fields;
  return {
    fields,
    from: query.from,
    to: query.to,
    bucket: query.bucket,
    aggregate: query.aggregate,
    order: query.order,
    limit: query.limit
  };
}

function toPointInput(
  resourceId: ResourceId,
  point: PointBody
): SeriesPointInput {
  const { time, resourceId: _resourceId, ...values } = point;
  return { resourceId, time, values: values as SeriesPointInput['values'] };
}

function toPointOutput(
  point: SeriesPoint,
  withResource: boolean
): Record<string, unknown> {
  return {
    ...(withResource ? { resourceId: point.resourceId } : {}),
    time: point.time.toISOString(),
    ...point.values
  };
}

function unique(ids: ResourceId[]): ResourceId[] {
  return [...new Map(ids.map((id) => [String(id), id])).values()];
}
