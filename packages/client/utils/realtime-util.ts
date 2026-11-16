import { OpenAPI3 } from 'openapi-typescript';
import { REALTIME_FIELD, REALTIME_MODULE_TYPE } from '../constants';

/** A JSON Schema of the `x-appweaver-realtime` extension, as TypeBox writes it. */
type JsonSchema = Record<string, any> | boolean | undefined;

/** The `x-appweaver-realtime` extension of an OpenAPI document of an Appweaver API with `@appweaver/realtime`. */
export type RealtimeSpec = {
  routePrefix: string;
  transports: string[];
  anonymous: boolean;
  channels: { name: string; payload: JsonSchema; params?: JsonSchema }[];
  resources: { model: string; channel: string; actions: string[] }[];
  actions: { name: string; payload: JsonSchema; response?: JsonSchema }[];
};

/**
 * Reads the `x-appweaver-realtime` extension of an OpenAPI document.
 *
 * @param {OpenAPI3} schema - The OpenAPI document.
 * @return {RealtimeSpec | undefined} The extension, or `undefined` for an API without realtime routes.
 */
export function realtimeSpec(schema: OpenAPI3): RealtimeSpec | undefined {
  const spec = (schema as unknown as Record<string, unknown>)[
    REALTIME_FIELD
  ] as RealtimeSpec | undefined;
  return spec?.routePrefix ? spec : undefined;
}

/**
 * Builds the `RealtimeModuleType` typing the `RealtimeClient` of the generated client: the payloads and parameters
 * of the channels, the actions and records of the resource events, and the payloads and results of the actions.
 *
 * @param {RealtimeSpec} spec - The extension of the OpenAPI document.
 * @param {string} typeContent - The generated types, naming the read type of a model (`<Model>Single`).
 * @return {string} The declaration of the type.
 */
export function realtimeModuleType(
  spec: RealtimeSpec,
  typeContent: string
): string {
  const channels = (spec.channels ?? []).map(
    (channel) =>
      `${propertyKey(channel.name)}: { payload: ${schemaToType(channel.payload)}; params: ${
        channel.params ? schemaToType(channel.params) : 'undefined'
      } }`
  );
  const resources = (spec.resources ?? []).map((resource) => {
    const single = `${resource.model}Single`;
    const record = new RegExp(`export type ${single}\\b`).test(typeContent)
      ? single
      : 'Record<string, unknown>';
    const actions =
      resource.actions.map((a) => JSON.stringify(a)).join(' | ') || 'never';
    return `${propertyKey(resource.model)}: { actions: ${actions}; record: ${record} }`;
  });
  const actions = (spec.actions ?? []).map(
    (action) =>
      `${propertyKey(action.name)}: { payload: ${schemaToType(action.payload)}; response: ${
        action.response ? schemaToType(action.response) : 'unknown'
      } }`
  );

  return `export type ${REALTIME_MODULE_TYPE} = { channels: { ${channels.join('; ')} }; resources: { ${resources.join(
    '; '
  )} }; actions: { ${actions.join('; ')} } };`;
}

/**
 * Converts a JSON Schema of the extension to a TypeScript type.
 *
 * @param {JsonSchema} schema - The schema.
 * @return {string} The type.
 */
export function schemaToType(schema: JsonSchema): string {
  if (schema === undefined || schema === true) {
    return 'unknown';
  }
  if (schema === false) {
    return 'never';
  }

  let type: string;

  if ('const' in schema) {
    type = JSON.stringify(schema.const);
  } else if (Array.isArray(schema.enum)) {
    type = schema.enum.map((v: unknown) => JSON.stringify(v)).join(' | ');
  } else if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    type = (schema.anyOf ?? schema.oneOf).map(wrapped).join(' | ');
  } else if (Array.isArray(schema.allOf)) {
    type = schema.allOf.map(wrapped).join(' & ');
  } else if (Array.isArray(schema.type)) {
    type = schema.type
      .map((t: string) => wrapped({ ...schema, type: t }))
      .join(' | ');
  } else {
    type = typeOf(schema);
  }

  return schema.nullable === true ? `${wrapped(type)} | null` : type;
}

function typeOf(schema: Record<string, any>): string {
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `${wrapped(schema.items)}[]`;
    case 'object':
      return objectType(schema);
    case 'void':
      return 'void';
    case 'undefined':
      return 'undefined';
    default:
      return schema.properties ? objectType(schema) : 'unknown';
  }
}

function objectType(schema: Record<string, any>): string {
  const required = new Set<string>(schema.required ?? []);
  const properties = Object.entries<JsonSchema>(schema.properties ?? {}).map(
    ([key, property]) =>
      `${propertyKey(key)}${required.has(key) ? '' : '?'}: ${schemaToType(property)}`
  );

  const additional = schema.additionalProperties;
  if (additional && additional !== false) {
    properties.push(`[key: string]: ${schemaToType(additional)}`);
  }

  return properties.length > 0
    ? `{ ${properties.join('; ')} }`
    : 'Record<string, never>';
}

/** A type as an operand of a union, an intersection or an array. */
function wrapped(schema: JsonSchema | string): string {
  const type = typeof schema === 'string' ? schema : schemaToType(schema);
  return /[|&]/.test(type) && !/^\{.*\}$/.test(type) ? `(${type})` : type;
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
