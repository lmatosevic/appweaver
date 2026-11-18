import {
  AiError,
  camelToSnakeCase,
  ConfigurationError,
  createLogger,
  ErrorCode
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { aiConfig } from '../config';
import { AiCapability } from '../types';
import { AiDriver, AiDriverClass, AiEndpoint } from './ai-driver';
import { ALL_CAPABILITIES, aiPresets } from './presets';

const logger = createLogger('ai');

/** The name of the contract the drivers are the providers of, matched by name like the other contracts. */
export const AI_DRIVER_CONTRACT = 'AiDriver';

/** The package providing the drivers of the presets, named when it is not installed. */
const DRIVER_PACKAGES: Record<string, string> = {
  openai: '@appweaver/openai'
};

const AI_DRIVERS = Symbol.for('appweaver.AiDrivers');
const registered = ((globalThis as Record<symbol, unknown>)[AI_DRIVERS] ??=
  new Map<string, AiDriverClass>()) as Map<string, AiDriverClass>;

/** A model reference resolved to its endpoint. */
export type ResolvedModel = {
  /** The model reference, i.e. `local:qwen3:8b` */
  reference: string;
  /** The name of the endpoint, i.e. `local` */
  endpoint: string;
  /** The model name on the endpoint, i.e. `qwen3:8b` */
  model: string;
};

/**
 * Registers a driver class under a name, which the endpoints select with their `driver`, without a module providing
 * it, i.e. a driver of the application or a stub in a test. A driver of a module replaces none registered so.
 *
 * @param {string} name - The name of the driver.
 * @param {AiDriverClass | undefined} driver - The driver class, or `undefined` to remove it.
 */
export function registerAiDriver(
  name: string,
  driver: AiDriverClass | undefined
): void {
  if (driver) {
    registered.set(name, driver);
  } else {
    registered.delete(name);
  }
}

/**
 * Resolves the model references and the aliases of the `ai` config to their endpoints, and creates the driver of an
 * endpoint once, on its first call.
 */
export class ModelRegistry {
  /** @internal */
  private readonly _drivers = new Map<string, Promise<AiDriver>>();

  /**
   * Resolves a model reference or an alias into the models to call in turn, the default model when none is given.
   *
   * @param {string} [model] - A model reference (`local:qwen3:8b`), an alias (`fast`), or none.
   * @param {string} [fallback] - The default reference or alias, i.e. `ai.defaultModel`.
   * @return {ResolvedModel[]} The models, more than one for an alias listing fallbacks.
   * @throws {AiError} `AI_MODEL_UNKNOWN` for an unknown alias or endpoint, or no model at all.
   */
  public resolve(
    model: string | undefined,
    fallback: string | undefined = aiConfig.DEFAULT_MODEL
  ): ResolvedModel[] {
    const name = model ?? fallback;
    if (!name) {
      throw new AiError(
        ErrorCode.AiModelUnknown,
        'No model given and no default model configured (ai.defaultModel, AI_DEFAULT_MODEL)',
        { model: '' }
      );
    }
    return this.references(name).map((reference) => this.parse(reference));
  }

  /**
   * Returns the endpoint of a name, completed with the defaults of its preset and the `ai` config.
   *
   * @param {string} name - The name of the endpoint.
   * @return {AiEndpoint} The endpoint.
   * @throws {AiError} `AI_MODEL_UNKNOWN` for an endpoint that is not configured.
   */
  public endpoint(name: string): AiEndpoint {
    const config =
      aiConfig.ENDPOINTS[name] ?? (name === 'mock' ? {} : undefined);
    if (!config) {
      throw new AiError(
        ErrorCode.AiModelUnknown,
        `No AI endpoint '${name}' configured, the endpoints are: ${[
          'mock',
          ...Object.keys(aiConfig.ENDPOINTS)
        ].join(', ')}`,
        { model: name }
      );
    }
    const presetName = config.preset ?? (name === 'mock' ? 'mock' : undefined);
    const preset = presetName ? aiPresets[presetName] : undefined;
    if (presetName && !preset) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Unknown preset '${presetName}' of the AI endpoint '${name}', the presets are: ${Object.keys(aiPresets).join(', ')}`
      );
    }
    const apiKeyVariable = preset?.apiKeyVariable;
    return {
      name,
      driver: config.driver ?? preset?.driver ?? 'openai',
      preset: presetName,
      baseUrl: config.baseUrl ?? preset?.baseUrl,
      apiKey:
        config.apiKey ??
        (apiKeyVariable ? process.env[apiKeyVariable] || undefined : undefined),
      headers: parseHeaders(config.headers ?? []),
      capabilities: (config.capabilities ??
        preset?.capabilities ??
        ALL_CAPABILITIES) as AiCapability[],
      timeout: config.timeout ?? aiConfig.TIMEOUT,
      maxRetries: config.maxRetries ?? aiConfig.MAX_RETRIES,
      options: preset?.options ?? {}
    };
  }

  /**
   * Returns the driver of an endpoint, created on its first call.
   *
   * @param {string} name - The name of the endpoint.
   * @return {Promise<AiDriver>} The driver.
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` when no enabled module provides its driver, or the endpoint
   * requires an API key it has not.
   */
  public driver(name: string): Promise<AiDriver> {
    let driver = this._drivers.get(name);
    if (!driver) {
      driver = this.createDriver(name);
      this._drivers.set(name, driver);
      driver.catch(() => this._drivers.delete(name));
    }
    return driver;
  }

  /**
   * Checks that the default models and every alias name configured endpoints.
   *
   * @return {string[]} The errors, empty when the config is valid.
   */
  public validate(): string[] {
    const errors: string[] = [];
    const named = [
      ...[aiConfig.DEFAULT_MODEL, aiConfig.DEFAULT_EMBEDDING_MODEL].filter(
        (model): model is string => !!model
      ),
      ...Object.keys(aiConfig.ALIASES)
    ];
    for (const name of named) {
      try {
        for (const { endpoint } of this.resolve(name)) {
          this.endpoint(endpoint);
        }
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    return errors;
  }

  /** @internal */
  private references(name: string): string[] {
    if (name.includes(':')) {
      return [name];
    }
    const alias = aiConfig.ALIASES[name];
    if (alias === undefined) {
      throw new AiError(
        ErrorCode.AiModelUnknown,
        `Unknown AI model '${name}': not a model reference (<endpoint>:<model>) nor an alias of ai.aliases`,
        { model: name }
      );
    }
    const references = (Array.isArray(alias) ? alias : alias.split(','))
      .map((reference) => reference.trim())
      .filter(Boolean);
    const invalid = references.find((reference) => !reference.includes(':'));
    if (invalid !== undefined || !references.length) {
      throw new AiError(
        ErrorCode.AiModelUnknown,
        `The AI alias '${name}' must list model references (<endpoint>:<model>), not '${invalid ?? ''}'`,
        { model: name }
      );
    }
    return references;
  }

  /** @internal */
  private parse(reference: string): ResolvedModel {
    const separator = reference.indexOf(':');
    const endpoint = reference.slice(0, separator);
    const model = reference.slice(separator + 1);
    if (!endpoint || !model) {
      throw new AiError(
        ErrorCode.AiModelUnknown,
        `Invalid AI model reference '${reference}', expected <endpoint>:<model>`,
        { model: reference }
      );
    }
    return { reference, endpoint, model };
  }

  /** @internal */
  private async createDriver(name: string): Promise<AiDriver> {
    const endpoint = this.endpoint(name);
    const preset = endpoint.preset ? aiPresets[endpoint.preset] : undefined;
    if (preset?.apiKeyRequired && !endpoint.apiKey) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The AI endpoint '${name}' needs an API key: set ai.endpoints.${name}.apiKey (AI_ENDPOINTS_${camelToSnakeCase(name).toUpperCase()}_API_KEY)${
          preset.apiKeyVariable ? ` or ${preset.apiKeyVariable}` : ''
        }`
      );
    }
    const Driver = await findDriver(endpoint.driver);
    if (!Driver) {
      const pkg = DRIVER_PACKAGES[endpoint.driver];
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `No enabled module provides the AI driver '${endpoint.driver}' of the endpoint '${name}'${
          pkg ? `, install ${pkg}` : ''
        }`
      );
    }
    logger.debug(
      { endpoint: name, driver: endpoint.driver, baseUrl: endpoint.baseUrl },
      'AI endpoint connected'
    );
    return new Driver(endpoint);
  }
}

/** Finds the class of a driver: a registered one, else the provider of an enabled module. */
async function findDriver(name: string): Promise<AiDriverClass | undefined> {
  const driver = registered.get(name);
  if (driver) {
    return driver;
  }
  const provider = context.modules.enabled
    .flatMap((module) => module.providers ?? [])
    .find(
      (entry) =>
        entry.contract.name === AI_DRIVER_CONTRACT && entry.name === name
    );
  if (provider) {
    return driverClass(await provider.load());
  }
  // The mock is built in, also without the module discovered, i.e. in a unit test
  if (name === 'mock') {
    return driverClass(await import('./mock-driver'));
  }
  return undefined;
}

/** The driver class a module exports, the first export with a `generate` method. */
function driverClass(exports: unknown): AiDriverClass | undefined {
  return Object.values(exports as Record<string, unknown>).find(
    (value): value is AiDriverClass =>
      typeof value === 'function' &&
      typeof (value as { prototype?: { generate?: unknown } }).prototype
        ?.generate === 'function'
  );
}

/** Parses the `Name: value` headers of an endpoint. */
function parseHeaders(headers: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const header of headers) {
    const separator = header.indexOf(':');
    if (separator > 0) {
      parsed[header.slice(0, separator).trim()] = header
        .slice(separator + 1)
        .trim();
    }
  }
  return parsed;
}
