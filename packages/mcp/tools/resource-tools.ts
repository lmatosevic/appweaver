import { TObject, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  camelToSnakeCase,
  RealtimeAccess,
  ResourceMcpAction,
  ResourceMcpConfig,
  ResourceModel,
  StringEnum
} from '@appweaver/common';
import { injectModel, injectService } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { AggregateDateSchema, AggregateNumericSchema } from '@appweaver/data';
import { mcpConfig } from '../config';
import { McpTool } from '../types';

const NUMERIC_TYPES = new Set(['int', 'bigInt', 'float']);

/** The operators of a field condition of the query tools, a subset of the full filter. */
const STRING_OPERATORS = ['_contains', '_starts', '_ends', '_ilike'];
const VALUE_OPERATORS = ['_eq', '_ne', '_gt', '_gte', '_lt', '_lte'];

/**
 * Builds the tools of the resource actions the `mcp` config of the resource routes exposes, named
 * `<model>_<action>` in snake case, i.e. `blog_post_query`.
 *
 * @return {McpTool[]} The tools.
 */
export function resourceTools(): McpTool[] {
  const tools: McpTool[] = [];
  for (const routes of context.resource.routes.values()) {
    const config = routes.config.mcp;
    const model = config && injectModel(routes.config.modelName, false);
    if (!config || !model) {
      continue;
    }
    for (const [action, { access, description }] of mcpActions(config)) {
      tools.push(resourceTool(model, config, action, access, description));
    }
  }
  return tools;
}

/** The exposed actions of a resource, each with its access and description. */
function mcpActions(
  config: ResourceMcpConfig
): Map<ResourceMcpAction, { access: RealtimeAccess; description?: string }> {
  const defaults = accessOf(config);
  const actions = new Map<
    ResourceMcpAction,
    { access: RealtimeAccess; description?: string }
  >();
  for (const entry of config.actions) {
    if (typeof entry === 'string') {
      actions.set(entry, { access: defaults });
    } else {
      const own = accessOf(entry);
      actions.set(entry.action, {
        access: Object.keys(own).length ? own : defaults,
        description: entry.description
      });
    }
  }
  return actions;
}

function resourceTool(
  model: ResourceModel,
  config: ResourceMcpConfig,
  action: ResourceMcpAction,
  access: RealtimeAccess,
  description?: string
): McpTool {
  const service = () => injectService(model.name as never) as any;
  const project = (record: unknown) => projectRecord(model, record, config);
  const id = idSchema(model);
  const about = config.description ? ` ${config.description}` : '';
  const tool = (
    summary: string,
    input: TSchema,
    call: McpTool['call']
  ): McpTool => ({
    name: `${camelToSnakeCase(model.name).toLowerCase()}_${action}`,
    description: (description ?? `${summary}.`) + about,
    input,
    readOnly: ['find', 'query', 'aggregate'].includes(action),
    destructive: action === 'update' || action === 'delete',
    access,
    call
  });

  switch (action) {
    case 'find':
      return tool(
        `Finds a ${model.name} by its id`,
        Type.Object({ id }),
        async ({ id }) => project(await service().find(id))
      );
    case 'query': {
      const limit = config.maxLimit ?? mcpConfig.MAX_LIMIT;
      return tool(
        `Queries the ${model.name} records, at most ${limit} per page`,
        Type.Object({
          filter: Type.Optional(filterSchema(model)),
          sort: Type.Optional(sortSchema(model)),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          size: Type.Optional(Type.Integer({ minimum: 1, maximum: limit })),
          cursor: Type.Optional(
            Type.String({ description: 'The nextCursor of a previous page' })
          )
        }),
        async (args) => {
          const response = await service().query({
            ...args,
            size: args.size ?? limit
          });
          return { ...response, items: response.items.map(project) };
        }
      );
    }
    case 'aggregate':
      return tool(
        `Aggregates the ${model.name} records over a date range, optionally in steps`,
        Type.Object({
          select: aggregateSchema(model),
          filter: Type.Optional(filterSchema(model)),
          dateField: Type.Optional(
            Type.String({ description: 'The date field of the range' })
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          step: Type.Optional(
            Type.Integer({ minimum: 1, description: 'Seconds per step' })
          )
        }),
        (args) => service().aggregate(args)
      );
    case 'create':
      return tool(
        `Creates a ${model.name}`,
        model.createOneModel,
        async (data) => project(await service().create(data))
      );
    case 'update':
      return tool(
        `Updates the given fields of a ${model.name}`,
        Type.Object({ id, data: model.updateOneModel }),
        async ({ id, data }) => project(await service().update(id, data))
      );
    case 'delete':
      return tool(
        `Deletes a ${model.name}`,
        Type.Object({ id }),
        async ({ id }) => project(await service().delete(id))
      );
  }
}

/** Projects a record onto the response schema of its model, without the excluded fields. */
function projectRecord(
  model: ResourceModel,
  record: unknown,
  config: ResourceMcpConfig
): unknown {
  const projected = Value.Clean(
    model.readOneModel,
    structuredClone(record)
  ) as Record<string, unknown>;
  for (const field of config.exclude ?? []) {
    delete projected[field];
  }
  return projected;
}

/** The schema of the id of a model. */
function idSchema(model: ResourceModel): TSchema {
  const idModel = model.idModel as TSchema;
  const object = idModel.properties
    ? idModel
    : idModel.$defs?.[idModel.$ref as string];
  return object?.properties?.id ?? Type.Union([Type.Integer(), Type.String()]);
}

/** The fields a query tool filters and sorts by, with the schema of their values. */
function fields(model: ResourceModel): [string, TSchema][] {
  const audit = {
    updatedAt: true,
    createdAt: true,
    createdById: true,
    ...model.config.audit
  };
  const result: [string, TSchema][] = [['id', idSchema(model)]];
  if (audit.createdAt) {
    result.push(['createdAt', Type.String({ format: 'date-time' })]);
  }
  if (audit.updatedAt) {
    result.push(['updatedAt', Type.String({ format: 'date-time' })]);
  }
  if (audit.createdById) {
    result.push(['createdById', Type.Union([Type.Integer(), Type.String()])]);
  }
  for (const [name, scalar] of Object.entries(model.config.scalars ?? {})) {
    const value = scalarValue(scalar);
    if (!scalar.hidden && !scalar.array && value) {
      result.push([name, value]);
    }
  }
  return result;
}

function scalarValue(scalar: {
  type: string;
  values?: string[];
}): TSchema | undefined {
  if (scalar.type === 'string') {
    return Type.String();
  }
  if (NUMERIC_TYPES.has(scalar.type)) {
    return Type.Number();
  }
  if (scalar.type === 'boolean') {
    return Type.Boolean();
  }
  if (scalar.type === 'dateTime') {
    return Type.String({ format: 'date-time' });
  }
  if (scalar.type === 'enum') {
    return StringEnum(scalar.values ?? []);
  }
  return undefined;
}

/** A filter of the fields of a model: a value, or a condition of the common operators, combined with `_or`. */
function filterSchema(model: ResourceModel): TObject {
  const conditions: Record<string, TSchema> = {};
  for (const [name, value] of fields(model)) {
    const operators: Record<string, TSchema> = {};
    for (const operator of VALUE_OPERATORS) {
      operators[operator] = Type.Optional(value);
    }
    operators._in = Type.Optional(Type.Array(value));
    operators._exists = Type.Optional(Type.Boolean());
    if (value.type === 'string' && !value.format && !value.enum) {
      for (const operator of STRING_OPERATORS) {
        operators[operator] = Type.Optional(Type.String());
      }
    }
    conditions[name] = Type.Optional(
      Type.Union([value, Type.Object(operators)])
    );
  }
  return Type.Object(
    {
      ...conditions,
      _or: Type.Optional(
        Type.Array(Type.Object(conditions), {
          description: 'Matches the records satisfying any of the conditions'
        })
      )
    },
    {
      description:
        'The conditions of the fields, all of which match: a value, or operators (_eq, _ne, _gt, _gte, _lt, ' +
        '_lte, _in, _exists, and _contains, _starts, _ends, _ilike for the texts)'
    }
  );
}

function sortSchema(model: ResourceModel): TObject {
  const properties: Record<string, TSchema> = {};
  for (const [name] of fields(model)) {
    properties[name] = Type.Optional(StringEnum(['asc', 'desc']));
  }
  return Type.Object(properties, {
    description:
      'The fields to sort by, in their order, i.e. { "createdAt": "desc" }'
  });
}

function aggregateSchema(model: ResourceModel): TObject {
  const properties: Record<string, TSchema> = {};
  for (const [name, value] of fields(model)) {
    if (value.type === 'number' || value.type === 'integer') {
      properties[name] = Type.Optional(AggregateNumericSchema);
    } else if (value.format === 'date-time') {
      properties[name] = Type.Optional(AggregateDateSchema);
    }
  }
  return Type.Object(properties, {
    description:
      'The aggregations of each field, i.e. { "price": { "sum": true, "avg": true } }'
  });
}

function accessOf(config: RealtimeAccess): RealtimeAccess {
  const access: RealtimeAccess = {};
  for (const key of ['public', 'roles', 'permissions'] as const) {
    if (config[key] !== undefined) {
      (access as Record<string, unknown>)[key] = config[key];
    }
  }
  return access;
}
