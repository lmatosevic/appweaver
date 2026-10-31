import { context } from '@appweaver/core/internal';

/**
 * Clears every definition from the application context, so each test starts with an empty container.
 */
export function resetContext(): void {
  context.resource.models.clear();
  context.resource.services.clear();
  context.resource.policies.clear();
  context.resource.routes.clear();
  context.modules.enabled.length = 0;
  context.modules.providers.clear();
  context.definitions.length = 0;
  context.decorators.clear();
}
