import { OpenAPI3, OperationObject } from 'openapi-typescript';
import { HttpMethod } from 'openapi-typescript-helpers';
import { FetchClient } from '../clients';
import { toSchemaObject } from '../utils';
import { RoutePathConfig, RouteType } from '../types';
import {
  ACCOUNT_MODULE_TYPE,
  ACCOUNT_OPERATIONS,
  AUTH_MODULE_TYPE,
  AUTH_OPERATIONS,
  CONFIG_FIELD,
  CONFIG_RESOURCE_FIELD,
  FILE_OPERATIONS,
  HEALTH_MODULE_TYPE,
  HEALTH_OPERATIONS,
  RESOURCE_MODULE_TYPE,
  RESOURCE_OPERATIONS
} from '../constants';

type SchemaRoutes = {
  resource: Record<string, string[]>;
  auth: string[];
  account: string[];
  health: string[];
  files: string[];
  custom: { method: HttpMethod; path: string; operationName: string }[];
};

type RouteDetails = {
  type: RouteType;
  operationName: string;
  resourceName?: string;
};

/**
 * Generates a client class based on the provided OpenAPI schema and already generated types.
 *
 * @param {string | OpenAPI3} schema - The OpenAPI schema used to generate the client. Can be a string
 * (URL or JSON/YAML) or an object.
 * @param {string} [clientName] - Optional name of the client class name to be generated. (default: derived from OpenAPI
 * title or WeaverClient if title is missing)
 * @param {string} [typesPath] - Optional path to the types module, for importing related type definitions.
 * @param {boolean} [noTypes=false] - Optional flag to disable client class generic types, useful for environments
 * without type support.
 * @return {Promise<string>} A Promise that resolves to the generated client class as a string.
 */
export async function generateClient(
  schema: string | OpenAPI3,
  clientName?: string,
  typesPath?: string,
  noTypes: boolean = false
): Promise<string> {
  const schemaObject =
    typeof schema === 'string' ? await toSchemaObject(schema) : schema;

  // Resolve the client class name
  let className = clientName;
  if (!className) {
    const openApiTitle = schemaObject.info?.title || 'Weaver';
    className = `${openApiTitle.replace(' ', '')}Client`;
  }

  // Resolve the type import statement and types prefix
  const typeName = 'Type';
  const typePrefix = typesPath ? `${typeName}.` : '';
  const pathsTypeImport =
    typesPath && !noTypes
      ? `import * as ${typeName} from '${typesPath}';\n`
      : '';
  const pathsTypeGeneric = !noTypes ? `<${typePrefix}paths>` : '';

  const config: RoutePathConfig = schemaObject[CONFIG_FIELD];

  const schemaRoutes: SchemaRoutes = {
    resource: {},
    auth: [],
    account: [],
    health: [],
    files: [],
    custom: []
  };

  for (const [path, item] of Object.entries(schemaObject.paths || {})) {
    // Skip object references
    if (item['$ref']) {
      continue;
    }

    for (const [method, operation] of Object.entries(item) as [
      HttpMethod,
      OperationObject
    ][]) {
      // Pass only for valid HTTP methods
      if (['servers', 'parameters'].includes(method)) {
        continue;
      }

      const { type, operationName, resourceName } = routeDetails(
        path,
        method,
        operation,
        config
      );

      // Populate schema routes based on route details
      if (type === 'resource') {
        if (!resourceName) {
          continue;
        }
        schemaRoutes.resource[resourceName] ??= [];
        schemaRoutes.resource[resourceName].push(operationName);
      } else if (type === 'custom') {
        if (path.startsWith(`${config.routePrefixes.auth}/login/`)) {
          continue;
        }
        schemaRoutes.custom.push({
          method,
          path,
          operationName
        });
      } else {
        schemaRoutes[type].push(operationName);
      }
    }
  }

  const clientMethods: { name: string; expression: string }[] = [];

  // Utility function for generating generic types for client methods using
  // module type prefix and omitted types based on operations usage
  const makeGenericTypes = (
    moduleTypeName: string | undefined,
    operations: Record<string, string>,
    usedOperations: string[]
  ): string => {
    if (noTypes) {
      return '';
    }

    const genericTypes: string[] = [];

    if (moduleTypeName) {
      genericTypes.push(`${typePrefix}${moduleTypeName}`);
    }

    const omittedFields = Object.keys(operations).filter(
      (o) => !usedOperations.includes(o)
    );
    if (omittedFields.length > 0) {
      genericTypes.push(
        `[${omittedFields.map((field) => "'" + field + "'").join(', ')}]`
      );
    }

    return genericTypes.length > 0 ? `<${genericTypes.join(', ')}>` : '';
  };

  // Add auth client
  if (schemaRoutes.auth.length > 0) {
    const genericTypes = makeGenericTypes(
      AUTH_MODULE_TYPE,
      AUTH_OPERATIONS,
      schemaRoutes.auth
    );
    clientMethods.push({
      name: 'auth',
      expression: `this.authClient${genericTypes}('${config.routePrefixes.auth}')`
    });
  }

  // Add account client
  if (schemaRoutes.account.length > 0) {
    const genericTypes = makeGenericTypes(
      ACCOUNT_MODULE_TYPE,
      ACCOUNT_OPERATIONS,
      schemaRoutes.account
    );
    clientMethods.push({
      name: 'account',
      expression: `this.accountClient${genericTypes}('${config.routePrefixes.account}')`
    });
  }

  // Add health client
  if (schemaRoutes.health.length > 0) {
    const genericTypes = makeGenericTypes(
      HEALTH_MODULE_TYPE,
      HEALTH_OPERATIONS,
      schemaRoutes.health
    );
    clientMethods.push({
      name: 'health',
      expression: `this.healthClient${genericTypes}('${config.routePrefixes.health}')`
    });
  }

  // Add file client
  if (schemaRoutes.files.length > 0) {
    const genericTypes = makeGenericTypes(
      undefined,
      FILE_OPERATIONS,
      schemaRoutes.files
    );
    clientMethods.push({
      name: 'files',
      expression: `this.filesClient${genericTypes}('${config.routePrefixes.files}')`
    });
  }

  // Add resource clients
  for (const [name, operations] of Object.entries(schemaRoutes.resource)) {
    const basePath = config.resourcePaths.find(
      (p) => p.name === name
    )?.basePath;
    if (!basePath) {
      continue;
    }

    const lowerName = name.charAt(0).toLowerCase() + name.slice(1);
    const resourcePath = `${config.routePrefixes.api}${basePath}`;
    const genericTypes = makeGenericTypes(
      `${name}${RESOURCE_MODULE_TYPE}`,
      RESOURCE_OPERATIONS,
      operations
    );

    clientMethods.push({
      name: lowerName,
      expression: `this.resourceClient${genericTypes}('${resourcePath}')`
    });
  }

  // Add custom requests
  for (const customRoute of schemaRoutes.custom) {
    const { method, path, operationName } = customRoute;
    clientMethods.push({
      name: operationName,
      expression: `this.customRequest('${method}', '${path}')`
    });
  }

  // Combine and resolve all client methods
  let clientMethodContent = '';
  const usedMethodNames = new Set<string>(
    Object.getOwnPropertyNames(FetchClient.prototype)
  );
  for (const { name, expression } of clientMethods) {
    // Uppercase the method name if it conflicts with existing class properties
    const propName = usedMethodNames.has(name)
      ? name.charAt(0).toUpperCase() + name.slice(1)
      : name;
    clientMethodContent += `public ${propName} = ${expression};\n\n`;
    usedMethodNames.add(propName);
  }

  return `import { ClientConfig, ClientError, FetchClient } from '@appweaver/client';
${pathsTypeImport}
export class ${className} extends FetchClient${pathsTypeGeneric} {
  ${clientMethodContent}
}

export function createClient(config: ClientConfig): ${className} {
  return new ${className}(config);
}

export { ClientError };
`;
}

/**
 * Retrieves the details for a specific route based on the provided path, HTTP method, and configuration.
 *
 * @param {string} path - The URL path for which route details are determined.
 * @param {HttpMethod} method - The HTTP method associated with the route (e.g., GET, POST).
 * @param {OperationObject} operation - The operation object containing metadata related to the route.
 * @param {RoutePathConfig} config - The schema configuration object containing route prefixes and resource paths.
 * @return {RouteDetails} An object representing the type of route, optionally including the operation name and
 * resource name if applicable.
 */
function routeDetails(
  path: string,
  method: HttpMethod,
  operation: OperationObject,
  config: RoutePathConfig
): RouteDetails {
  try {
    const prefixChecks: [RouteType, string, Record<string, HttpMethod>][] = [
      ['auth', config.routePrefixes.auth, AUTH_OPERATIONS],
      ['account', config.routePrefixes.account, ACCOUNT_OPERATIONS],
      ['health', config.routePrefixes.health, HEALTH_OPERATIONS],
      ['files', config.routePrefixes.files, FILE_OPERATIONS]
    ];

    // Try to detect predefined module-specific routes
    for (const [routeType, prefix, operations] of prefixChecks) {
      const operationName = routeOperation(path, method, prefix, operations);
      if (operationName) {
        return { type: routeType, operationName };
      }
    }

    // Try to detect resource routes using resource name and route prefix
    const resourceName = operation[CONFIG_RESOURCE_FIELD];
    const resourcePath = config.resourcePaths.find(
      (rp) => rp.name === resourceName
    )?.basePath;
    const resourcePathPrefix = `${config.routePrefixes.api}${resourcePath}`;
    if (resourceName && resourcePath && path.startsWith(resourcePathPrefix)) {
      const pathSuffix = path.replace(resourcePathPrefix, '');
      const operationName = resourceOperation(pathSuffix, method);
      if (operationName) {
        return { type: 'resource', resourceName, operationName };
      }
    }
  } catch {
    // If schema config is invalid or missing, default to custom route type
    return {
      type: 'custom',
      operationName: createOperationName(path, method, config)
    };
  }

  return {
    type: 'custom',
    operationName: createOperationName(path, method, config)
  };
}

/**
 * Generates an operation name based on the provided API path, HTTP method, and schema configuration.
 *
 * @param {string} path - The API path for which the operation name is being generated.
 * @param {HttpMethod} method - The HTTP method (e.g., GET, POST, PUT) associated with the operation.
 * @param {RoutePathConfig} config - The configuration object containing schema details, including route prefixes.
 * @return {string} A generated string representing the operation name.
 */
function createOperationName(
  path: string,
  method: HttpMethod,
  config: RoutePathConfig
): string {
  if (path.replace(config.routePrefixes.api, '').replace('/', '') === '') {
    return 'info';
  }

  const capitalize = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const parts = path.split('/');
  const camelCasePath = parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('{') && part.endsWith('}')) {
        const nextPart = parts[index + 1];
        const partSlice = part.slice(1, -1).replace('*', 'Any');
        if (nextPart && nextPart.length > 0) {
          return 'By' + capitalize(partSlice);
        }
        return 'By' + capitalize(partSlice);
      }
      return capitalize(part);
    })
    .join('')
    .replace(/-[a-z0-9]/g, (match) => match.replace('-', '').toUpperCase())
    .replace(/^By(.*)/g, 'by$1');

  return `${method}${camelCasePath}`;
}

/**
 * Finds a route operation based on the given path, method, prefix, and operations mappings.
 *
 * @param {string} path - The request path to be matched against the operations.
 * @param {HttpMethod} method - The HTTP method to be matched (e.g., GET, POST).
 * @param {string} prefix - The prefix to be removed from the path before processing.
 * @param {Record<string, HttpMethod>} operations - A record mapping operation names to their corresponding HTTP methods.
 * @return {string | undefined} The matching operation name, or `undefined` if no match is found.
 */
function routeOperation(
  path: string,
  method: HttpMethod,
  prefix: string,
  operations: Record<string, HttpMethod>
): string | undefined {
  if (!path.startsWith(prefix)) {
    return undefined;
  }

  const normalizedRoute = path
    .replace(prefix, '')
    .replace(/^\//, '')
    .replace(/\/\{[\w*]+}$/, '')
    .replace(/-/g, '')
    .toLowerCase();

  return Object.entries(operations).find(
    ([operation, operationMethod]) =>
      normalizedRoute === operation.toLowerCase() && method === operationMethod
  )?.[0];
}

/**
 * Determines the resource operation based on the provided path suffix and HTTP method.
 *
 * @param {string} pathSuffix - The suffix of the path used to identify a specific resource operation.
 * @param {HttpMethod} method - The HTTP method (e.g., GET, POST, PUT, DELETE) corresponding to the operation.
 * @return {string | undefined} - The matching resource operation key, or undefined if no
 * match is found.
 */
function resourceOperation(
  pathSuffix: string,
  method: HttpMethod
): keyof typeof RESOURCE_OPERATIONS | undefined {
  const operationMap: Record<
    string,
    Record<string, keyof typeof RESOURCE_OPERATIONS>
  > = {
    get: {
      '{id}': 'find'
    },
    post: {
      query: 'query',
      aggregate: 'aggregate',
      '': 'create',
      export: 'export',
      '{id}/files': 'uploadFiles',
      '{id}/delete-files': 'deleteFiles'
    },
    put: {
      '{id}': 'update'
    },
    delete: {
      '{id}': 'delete'
    }
  };

  return operationMap[method]?.[pathSuffix.replace(/^\//, '')];
}
