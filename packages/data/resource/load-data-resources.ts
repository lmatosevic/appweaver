import {
  ImageProcessor,
  createLogger,
  ModuleSetupContext
} from '@appweaver/common';
import { isDefined } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { LoadResourcePaths, loadResources } from './resource-loader';

const logger = createLogger('resource');

/**
 * The setup of `@appweaver/data`: loads the models, services and policies of the application, then the resources of
 * the modules, unless the `autoLoadResources` parameter of `createApp` is `false`.
 *
 * @param {ModuleSetupContext} setupContext - The setup context.
 */
export async function loadDataResources(
  setupContext: ModuleSetupContext
): Promise<void> {
  if (setupContext.params.autoLoadResources === false) {
    return;
  }

  await loadResources(
    setupContext.scanPath,
    setupContext.params.resourcePaths as LoadResourcePaths | undefined,
    setupContext.modules.flatMap((module) =>
      module.resources ? [module.resources] : []
    )
  );

  warnUnprocessedImages();
}

/**
 * Warns about the file fields transforming their images (`image`) when no image processor is provided, since their
 * images are then stored as they are uploaded.
 */
export function warnUnprocessedImages(): void {
  if (isDefined(ImageProcessor)) {
    return;
  }

  const fields = [...context.resource.models.values()].flatMap((model) =>
    Object.entries(model.config.files ?? {})
      .filter(([, field]) => field?.image)
      .map(([name]) => `${model.name}.${name}`)
  );

  if (fields.length > 0) {
    logger.warn(
      { fields },
      'The images of these file fields are stored unprocessed, since no image processor is provided: install ' +
        '@appweaver/sharp, or select one in IMAGE_PROVIDER'
    );
  }
}
