import {
  AbstractCtor,
  appConfig,
  Environment,
  ErrorCode,
  isConstructor,
  logger,
  ModuleError,
  ModuleProvider,
  PROVIDER_AUTO,
  PROVIDER_NONE,
  Queue
} from '@appweaver/common';
import { context } from '../context/context';
import {
  define,
  isDefined,
  loadProvider
} from '../context/dependency-injection';
import { EnabledModule } from './discover-modules';

/**
 * Defines the provider selected for every contract the enabled modules declare, then the services of the modules
 * whose required contracts are provided, in the order of the modules. A provider key holds `auto`, `none`, the name
 * of a provider of an enabled module, or the module path of an implementation (`@/infra/my-storage`).
 *
 * @param {EnabledModule[]} modules - The enabled modules.
 * @param {string} baseDir - The source directory the `@/` module paths resolve against.
 * @throws {ModuleError} For a provider name no enabled module registers, or for `auto` matching two providers.
 */
export async function loadProviders(
  modules: EnabledModule[],
  baseDir: string
): Promise<void> {
  const providers = modules.flatMap(({ module }) => module.providers ?? []);
  const selected: Record<string, string> = {};

  for (const { module } of modules) {
    for (const { contract, provider } of module.contracts ?? []) {
      const name = await loadContractProvider(
        contract,
        provider(),
        providers.filter((entry) => entry.contract === contract),
        baseDir
      );
      if (name) {
        selected[contract.name] = name;
        context.modules.providers.set(contract.name, name);
      }
    }
  }

  for (const { module } of modules) {
    for (const service of module.services ?? []) {
      if ((service.requires ?? []).every((contract) => isDefined(contract))) {
        defineExports(await service.load(), undefined);
      }
    }
  }

  logger.debug(
    {
      modules: modules.map(({ module }) => module.name),
      providers: selected
    },
    'Modules loaded'
  );

  if (
    selected[Queue.name] === 'memory' &&
    (appConfig.ENV as Environment) === Environment.Production
  ) {
    logger.warn(
      'The memory queue is used in production, its jobs (and the emails) are lost on a restart'
    );
  }
}

/**
 * Returns the name of the provider selected for a contract, i.e. `redis` for the `Memory`, or undefined when none is.
 *
 * @param {AbstractCtor} contract - The contract.
 * @return {string | undefined} The name of the provider, or the module path it was loaded from.
 */
export function selectedProvider(contract: AbstractCtor): string | undefined {
  return context.modules.providers.get(contract.name);
}

/** Defines the selected provider of a contract, returning its name, or undefined when none is selected. */
async function loadContractProvider(
  contract: AbstractCtor,
  value: string,
  providers: ModuleProvider[],
  baseDir: string
): Promise<string | undefined> {
  if (!value || value === PROVIDER_NONE) {
    return undefined;
  }

  let provider: ModuleProvider | undefined;
  if (value === PROVIDER_AUTO) {
    provider = selectAuto(contract, providers);
    if (!provider) {
      return undefined;
    }
  } else {
    provider = providers.find((entry) => entry.name === value);
  }

  if (provider) {
    defineExports(await provider.load(), contract);
    return provider.name;
  }

  if (isModulePath(value)) {
    loadProvider(baseDir, value, contract);
    return value;
  }

  throw new ModuleError(
    ErrorCode.ModuleProviderMissing,
    `No enabled module provides '${value}' for ${contract.name}, the providers are: ${
      providers.map((entry) => entry.name).join(', ') || 'none'
    }`,
    { contract: contract.name, provider: value }
  );
}

/** Selects the provider of a contract for `auto`: the one of an enabled module, otherwise the fallback. */
function selectAuto(
  contract: AbstractCtor,
  providers: ModuleProvider[]
): ModuleProvider | undefined {
  const preferred = providers.filter((entry) => (entry.auto ?? true) === true);
  const candidates = preferred.length
    ? preferred
    : providers.filter((entry) => entry.auto === 'fallback');

  if (candidates.length > 1) {
    const names = candidates.map((entry) => entry.name);
    throw new ModuleError(
      ErrorCode.ModuleProviderAmbiguous,
      `More than one enabled module provides ${contract.name} (${names.join(', ')}), select one in its provider key`,
      { contract: contract.name, providers: names }
    );
  }

  return candidates[0];
}

/** Defines the first class a module exports, or its first export when it exports no class. */
function defineExports(exports: unknown, contract: AbstractCtor | undefined) {
  const values = Object.values(exports as Record<string, unknown>);
  const value = values.find((exported) => isConstructor(exported)) ?? values[0];
  define(value as object, contract, 'override');
}

/** Checks if a provider value is a module path rather than a provider name. */
function isModulePath(value: string): boolean {
  return /[./\\@]/.test(value);
}
