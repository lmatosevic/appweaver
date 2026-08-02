import { context } from '../../context';

/**
 * Clears every definition from the shared application context so each test
 * starts with an empty container.
 */
export function resetContext(): void {
  context.server = null;
  context.resource.models.clear();
  context.resource.services.clear();
  context.resource.policies.clear();
  context.resource.routes.clear();
  context.definitions.length = 0;
}
