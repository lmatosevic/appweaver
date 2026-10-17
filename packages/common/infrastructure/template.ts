import { OnInit } from '../interfaces';
import { LIFECYCLE } from '../constants';

/** The data a template renders. */
export type TemplateData = Record<string, any>;

/** A function the templates call by name, i.e. a Handlebars helper. */
export type TemplateHelper = (...args: any[]) => unknown;

export type TemplateRenderOptions = {
  /** The locale to render in, selecting the localized template variants and translations. Defaults to the
   * `LOCALE_DEFAULT` config. */
  locale?: string;
};

export type TemplateStringRenderOptions = TemplateRenderOptions & {
  /** The output format deciding how the values are escaped, i.e. `html` or `txt`. Default: `html`. */
  format?: string;
};

export abstract class TemplateEngine implements OnInit {
  static [LIFECYCLE] = true;

  /**
   * Loads the templates of the configured templates' directory.
   */
  abstract onInit(): Promise<void>;

  /**
   * Renders a template by name. The name is the template's path relative to the templates' directory, without the
   * engine extension and the locale, i.e. `emails/password-reset.html` for `emails/password-reset.de.html.hbs`. The
   * variant of the given locale is preferred over the variant of its language, the default locale and the template
   * without a locale.
   *
   * @param {string} name - The template name.
   * @param {TemplateData} [data] - The data to render the template with.
   * @param {TemplateRenderOptions} [options] - The render options, i.e. the locale.
   * @return {Promise<string>} A promise that resolves to the rendered content.
   * @throws {AppweaverError} `TEMPLATE_NOT_FOUND` if no template of the name exists, `TEMPLATE_RENDER_FAILED` if
   * rendering fails.
   */
  abstract render(
    name: string,
    data?: TemplateData,
    options?: TemplateRenderOptions
  ): Promise<string>;

  /**
   * Renders a template source string, which can include the registered partials and use the registered helpers.
   *
   * @param {string} source - The template source.
   * @param {TemplateData} [data] - The data to render the template with.
   * @param {TemplateStringRenderOptions} [options] - The render options, i.e. the locale and output format.
   * @return {Promise<string>} A promise that resolves to the rendered content.
   * @throws {AppweaverError} `TEMPLATE_RENDER_FAILED` if rendering fails.
   */
  abstract renderString(
    source: string,
    data?: TemplateData,
    options?: TemplateStringRenderOptions
  ): Promise<string>;

  /**
   * Tells whether a template exists in the locale, one of its fallbacks, or without a locale.
   *
   * @param {string} name - The template name, i.e. `emails/password-reset.html`.
   * @param {string} [locale] - The locale to look the template up for. Defaults to the `LOCALE_DEFAULT` config.
   * @return {Promise<boolean>} A promise that resolves to `true` if the template exists, otherwise `false`.
   */
  abstract hasTemplate(name: string, locale?: string): Promise<boolean>;

  /**
   * Registers a template from a source string, replacing a template of the same name and locale. The registered
   * templates take precedence over the template files.
   *
   * @param {string} name - The template name, i.e. `emails/welcome.html`.
   * @param {string} source - The template source.
   * @param {string} [locale] - The locale of a localized template variant.
   */
  abstract registerTemplate(
    name: string,
    source: string,
    locale?: string
  ): void;

  /**
   * Registers a helper function the templates can call by name, replacing a helper of the same name.
   *
   * @param {string} name - The helper name.
   * @param {TemplateHelper} helper - The helper function.
   */
  abstract registerHelper(name: string, helper: TemplateHelper): void;
}
