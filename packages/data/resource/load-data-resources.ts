import { ModuleSetupContext } from '@appweaver/common';
import { LoadResourcePaths, loadResources } from './resource-loader';

/**
 * The setup of `@appweaver/data`: loads the models, services and policies of the application, then the resources of
 * the modules, unless the `autoLoadResources` parameter of `createApp` is `false`.
 *
 * @param {ModuleSetupContext} context - The setup context.
 */
export async function loadDataResources(
  context: ModuleSetupContext
): Promise<void> {
  if (context.params.autoLoadResources === false) {
    return;
  }

  await loadResources(
    context.scanPath,
    context.params.resourcePaths as LoadResourcePaths | undefined,
    context.modules.flatMap((module) =>
      module.resources ? [module.resources] : []
    )
  );
}
