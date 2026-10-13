import { TemplateEngine, TemplateHelper } from '@appweaver/common';
import { inject } from '../context';

/**
 * Registers a template from a source string, taking precedence over a template file of the same name and locale.
 *
 * @param {string} name - The template name, i.e. `emails/welcome.html`.
 * @param {string} source - The template source.
 * @param {string} [locale] - The locale of a localized template variant.
 */
export function registerTemplate(
  name: string,
  source: string,
  locale?: string
): void {
  inject(TemplateEngine).registerTemplate(name, source, locale);
}

/**
 * Registers a helper function the templates can call by name, i.e. `{{discount price 10}}`.
 *
 * @param {string} name - The helper name.
 * @param {TemplateHelper} helper - The helper function, receiving the engine options as its last argument.
 */
export function registerTemplateHelper(
  name: string,
  helper: TemplateHelper
): void {
  inject(TemplateEngine).registerHelper(name, helper);
}

/**
 * Registers several helper functions at once, i.e. the helpers of a third party helper library.
 *
 * @param {Record<string, TemplateHelper>} helpers - The helper functions keyed by name.
 */
export function registerTemplateHelpers(
  helpers: Record<string, TemplateHelper>
): void {
  const engine = inject(TemplateEngine);
  for (const [name, helper] of Object.entries(helpers)) {
    engine.registerHelper(name, helper);
  }
}
