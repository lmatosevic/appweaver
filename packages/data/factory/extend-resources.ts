import {
  ActionType,
  callerSource,
  capitalize,
  ConfigurationError,
  createLogger,
  CONFIG,
  ErrorCode,
  isRelationArray,
  ModelExtensionConfig,
  ModelName,
  OperationConfig,
  RESOURCE_MODEL_EXTEND,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_SOURCE,
  RESOURCE_TYPE,
  ResourceModel,
  ResourceModelConfig,
  ResourcePolicyConfig,
  ResourceServiceConfig,
  UpdateOperationConfig
} from '@appweaver/common';
import { define } from '@appweaver/core';
import {
  context,
  registerExtension,
  resourceExtensions
} from '@appweaver/core/internal';
import { createService } from './create-service';

const logger = createLogger('resource');

/** The kind of a value `extendModel`, `extendService` and `extendPolicy` return, never a definition itself. */
export const RESOURCE_EXTENSION_TYPE = 'Extension';

/** The mark of an extension, which the resource loader leaves out of the definitions. */
export type ResourceExtensionMark<T> = {
  [RESOURCE_NAME]: string;
  [RESOURCE_TYPE]: typeof RESOURCE_EXTENSION_TYPE;
  config: T;
};

type Hooks = Omit<ResourceServiceConfig, 'modelName'>;
type PolicyExtension = Omit<ResourcePolicyConfig, 'modelName'>;

const FIELD_MAPS = [
  'scalars',
  'relations',
  'files',
  'virtual',
  'geo',
  'series'
] as const;

/**
 * Extends a model defined elsewhere, i.e. a framework or module model like `ApiKey`, merged field by field once every
 * model is loaded: a new field is added (it must be optional or have a default, since the framework creates these
 * records), the options of an existing one are overridden, the indexes added, and the `omit`/`pick` lists, the update
 * operations and the export config merged. A field cannot be removed. A second `createModel` under a taken name
 * fails instead.
 *
 * @example
 * export default extendModel('ApiKey', {
 *   scalars: { label: { type: 'string', required: false } },
 *   index: ['label']
 * });
 *
 * @param {string} modelName - The name of the model to extend.
 * @param {ModelExtensionConfig} extension - What to add or change.
 * @return {Object} The mark of the extension, which the loader leaves out of the models.
 */
export function extendModel(
  modelName: ModelName,
  extension: ModelExtensionConfig
): ResourceExtensionMark<ModelExtensionConfig> {
  return extend('model', modelName, extension, callerSource(extendModel));
}

/**
 * Extends the service of a model defined elsewhere with hooks running after its own ones, the `textSearch` replacing
 * its own. Without a service, the model gets one with the hooks, as with `createService`.
 *
 * @example
 * export default extendService('ApiKey', { afterCreate: async (key) => notifyOwner(key) });
 *
 * @param {string} modelName - The name of the model whose service to extend.
 * @param {Object} hooks - The hooks.
 * @return {Object} The mark of the extension, which the loader leaves out of the services.
 */
export function extendService(
  modelName: ModelName,
  hooks: Hooks
): ResourceExtensionMark<Hooks> {
  return extend('service', modelName, hooks, callerSource(extendService));
}

/**
 * Extends the policy of a model defined elsewhere: both must allow, so an extension never loosens it. The access
 * checks and the file, series and event checks must all pass, the read restrictions of both apply, and the write
 * restrictions of the extended policy win. Without a policy, the extension is the policy of the model.
 *
 * @example
 * export default extendPolicy('ApiKey', { checkAccess: (user) => !!user && hasRole(user, 'Integrator') });
 *
 * @param {string} modelName - The name of the model whose policy to extend.
 * @param {Object} policy - The policy.
 * @return {Object} The mark of the extension, which the loader leaves out of the policies.
 */
export function extendPolicy(
  modelName: ModelName,
  policy: PolicyExtension
): ResourceExtensionMark<PolicyExtension> {
  return extend('policy', modelName, policy, callerSource(extendPolicy));
}

function extend<T>(
  kind: 'model' | 'service' | 'policy',
  modelName: string,
  config: T,
  source?: string
): ResourceExtensionMark<T> {
  const name = capitalize(modelName);
  registerExtension(kind, name, config, source);
  return {
    [RESOURCE_NAME]: name,
    [RESOURCE_TYPE]: RESOURCE_EXTENSION_TYPE,
    config
  };
}

/**
 * Applies the extensions of `extendModel` to the loaded models, in the order they were declared.
 *
 * @param {Record<string, ResourceModel>} models - The loaded models, by name.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an extension adding a required field or changing a field
 * into another type.
 */
export function applyModelExtensions(
  models: Record<string, ResourceModel>
): void {
  for (const [name, extensions] of resourceExtensions<ModelExtensionConfig>(
    'model'
  )) {
    const model = models[name] ?? context.resource.models.get(name);
    if (!model) {
      warnMissing('model', name, extensions[0].source);
      continue;
    }
    for (const { config, source } of extensions) {
      model[RESOURCE_MODEL_EXTEND]?.((base: ResourceModelConfig) =>
        mergeModelConfig(base, config, source)
      );
    }
  }
}

/** Applies the extensions of `extendService` to the loaded services. */
export function applyServiceExtensions(): void {
  for (const [name, extensions] of resourceExtensions<Hooks>('service')) {
    const service = context.resource.services.get(name) as
      | { [CONFIG]?: ResourceServiceConfig }
      | undefined;
    if (!service) {
      createService({
        modelName: name,
        ...extensions.reduce<Hooks>(
          (hooks, { config }) => composeHooks(hooks, config),
          {}
        )
      });
      continue;
    }
    const config = service[CONFIG];
    if (!config) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `extendService('${name}') in ${extensions[0].source ?? 'an unknown file'} cannot extend the service of ` +
          `${name}, a class not created by createService`
      );
    }
    for (const { config: hooks } of extensions) {
      Object.assign(config, composeHooks(config, hooks));
    }
  }
}

/** Applies the extensions of `extendPolicy` to the loaded policies. */
export function applyPolicyExtensions(): void {
  for (const [name, extensions] of resourceExtensions<PolicyExtension>(
    'policy'
  )) {
    let policy = context.resource.policies.get(name);
    for (const { config, source } of extensions) {
      if (!policy) {
        policy = {
          ...config,
          modelName: name,
          [RESOURCE_NAME]: name,
          [RESOURCE_TYPE]: RESOURCE_POLICY_TYPE,
          [RESOURCE_SOURCE]: source
        };
        define(policy, name);
      } else {
        Object.assign(policy, composePolicies(policy, config));
      }
    }
  }
}

/**
 * Merges an extension into the config of a model.
 *
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for a new required field or a field changing its type.
 */
export function mergeModelConfig(
  base: ResourceModelConfig,
  extension: ModelExtensionConfig,
  source?: string
): ResourceModelConfig {
  const merged: Record<string, any> = { ...base };
  const where = `extendModel('${capitalize(base.name)}') in ${source ?? 'an unknown file'}`;

  for (const map of FIELD_MAPS) {
    const fields = extension[map] as Record<string, any> | undefined;
    if (!fields) {
      continue;
    }
    const current = { ...((base[map] as Record<string, any>) ?? {}) };
    for (const [field, options] of Object.entries(fields)) {
      const existing = current[field];
      if (existing) {
        if (options.type && existing.type && options.type !== existing.type) {
          throw invalid(
            `${where} cannot change the type of the field '${field}'`
          );
        }
        current[field] = { ...existing, ...options };
      } else {
        if (!isOptionalField(map, options)) {
          throw invalid(
            `${where} adds the required field '${field}': the framework creates these records, so it must be ` +
              `optional (required: false) or have a default`
          );
        }
        current[field] = options;
      }
    }
    merged[map] = current;
  }

  for (const list of ['index', 'unique'] as const) {
    if (extension[list]) {
      merged[list] = [...(base[list] ?? []), ...extension[list]];
    }
  }

  for (const operation of ['read', 'create', 'update'] as const) {
    if (extension[operation]) {
      merged[operation] = mergeOperation(base[operation], extension[operation]);
    }
  }

  if (extension.export) {
    merged.export = { ...base.export, ...extension.export };
  }

  return merged as ResourceModelConfig;
}

function isOptionalField(map: string, options: Record<string, any>): boolean {
  if (map === 'virtual' || map === 'series' || map === 'files') {
    return options.required !== true;
  }
  if (map === 'relations') {
    return options.required === false || isRelationArray(options as never);
  }
  return options.required === false || options.default !== undefined;
}

function mergeOperation(
  base: UpdateOperationConfig | undefined,
  extension: UpdateOperationConfig
): UpdateOperationConfig {
  const union = (a?: string[], b?: string[]) =>
    a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined;
  const merged: UpdateOperationConfig = {
    ...base,
    omit: union(base?.omit, extension.omit),
    pick: union(base?.pick, extension.pick)
  };
  if (base?.operations || extension.operations) {
    merged.operations = { ...base?.operations, ...extension.operations };
  }
  for (const key of ['omit', 'pick', 'operations'] as const) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  return merged;
}

/** The hooks of a service and of its extension, the before and after hooks of the service running first. */
function composeHooks(base: Hooks, extension: Hooks): Hooks {
  const composed: Record<string, unknown> = {};
  for (const [name, hook] of Object.entries(extension)) {
    const own = (base as Record<string, unknown>)[name];
    composed[name] =
      typeof hook === 'function' && typeof own === 'function'
        ? async (...args: unknown[]) => {
            await (own as (...a: unknown[]) => unknown)(...args);
            await (hook as (...a: unknown[]) => unknown)(...args);
          }
        : hook;
  }
  return composed;
}

/** The callbacks of a policy composed with the ones of its extension, both having to allow. */
function composePolicies(
  base: ResourcePolicyConfig,
  extension: PolicyExtension
): Partial<ResourcePolicyConfig> {
  const both =
    <A extends unknown[]>(
      own?: (...args: A) => unknown,
      added?: (...args: A) => unknown
    ) =>
    async (...args: A) =>
      (await own?.(...args)) !== false && (await added?.(...args)) !== false;
  const composed: Partial<ResourcePolicyConfig> = {};

  if (extension.checkAccess) {
    composed.checkAccess = both(base.checkAccess, extension.checkAccess);
  }
  if (extension.events) {
    composed.events = both(base.events, extension.events);
  }
  if (extension.readRestrictions) {
    const own = base.readRestrictions;
    const added = extension.readRestrictions;
    composed.readRestrictions = async (user, resource, action) => {
      const conditions = [
        await own?.(user, resource, action),
        await added(user, resource, action)
      ].filter(
        (where): where is Record<string, any> =>
          !!where && Object.keys(where).length > 0
      );
      return conditions.length > 1 ? { AND: conditions } : conditions[0];
    };
  }
  if (extension.writeRestrictions) {
    const own = base.writeRestrictions;
    const added = extension.writeRestrictions;
    // The restrictions of the extended policy win, so an extension cannot loosen them
    composed.writeRestrictions = async (user, resource, action) => ({
      ...((await added(user, resource, action)) ?? {}),
      ...((await own?.(user, resource, action)) ?? {})
    });
  }
  if (extension.files) {
    const files = { ...base.files };
    for (const [field, checks] of Object.entries(extension.files)) {
      const own = files[field] ?? {};
      files[field] = {
        accessType: own.accessType ?? checks.accessType,
        canAccess: both(own.canAccess, checks.canAccess),
        canCreate: both(own.canCreate, checks.canCreate),
        canDelete: both(own.canDelete, checks.canDelete)
      };
    }
    composed.files = files;
  }
  if (extension.series) {
    const own = base.series ?? {};
    composed.series = {
      canRead: both(own.canRead, extension.series.canRead),
      canWrite: both(own.canWrite, extension.series.canWrite),
      canDelete: both(own.canDelete, extension.series.canDelete)
    };
  }
  return composed;
}

function warnMissing(kind: string, name: string, source?: string): void {
  logger.warn(
    { model: name, source },
    `The ${kind} extension of ${name} extends nothing: the application has no ${name} model`
  );
}

function invalid(message: string): ConfigurationError {
  return new ConfigurationError(ErrorCode.ConfigurationInvalid, message);
}
