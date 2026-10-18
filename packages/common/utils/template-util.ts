/** The MIME types of the template formats, a format not listed is served as `text/plain`. */
export const TEMPLATE_MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  xhtml: 'application/xhtml+xml',
  xml: 'application/xml',
  rss: 'application/rss+xml',
  atom: 'application/atom+xml',
  svg: 'image/svg+xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  md: 'text/markdown',
  ics: 'text/calendar',
  vcf: 'text/vcard',
  txt: 'text/plain'
};

/** The template formats whose output is escaped as markup, every other format is rendered as is. */
const ESCAPED_FORMATS = new Set([
  'html',
  'htm',
  'xhtml',
  'xml',
  'rss',
  'atom',
  'svg'
]);

export type TemplatePath = {
  /** The template name, the path relative to the templates' directory without the locale, i.e.
   * `emails/password-reset.html`. */
  name: string;
  /** The output format, the last extension of the name, i.e. `html`. Empty when the name has no extension. */
  format: string;
  /** The locale of a localized template variant, i.e. `de` of `emails/password-reset.de.html`. */
  locale?: string;
};

/**
 * Tells whether a string is a locale tag supported by the runtime, i.e. `de` or `en-US`.
 *
 * @param {string} value - The string to check.
 * @return {boolean} `true` if the value is a supported locale tag, otherwise `false`.
 */
export function isLocaleTag(value: string): boolean {
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(value)) {
    return false;
  }
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(value).length > 0;
  } catch {
    return false;
  }
}

/**
 * Parses the path of a template file, relative to the templates' directory and stripped of the engine extension,
 * into the template name, format and locale. A segment before the format is the locale of a localized variant when
 * the runtime supports it as a locale, so `feed.rss.xml` keeps `feed.rss` as its name.
 *
 * @param {string} filePath - The relative template path, i.e. `emails/password-reset.de.html`.
 * @return {TemplatePath} The parsed template name, format and locale.
 */
export function parseTemplatePath(filePath: string): TemplatePath {
  const unifiedPath = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const slash = unifiedPath.lastIndexOf('/');
  const dir = unifiedPath.slice(0, slash + 1);
  const segments = unifiedPath.slice(slash + 1).split('.');

  if (segments.length < 2) {
    return { name: unifiedPath, format: '' };
  }

  const format = segments[segments.length - 1].toLowerCase();
  if (segments.length >= 3 && isLocaleTag(segments[segments.length - 2])) {
    const locale = segments.splice(segments.length - 2, 1)[0];
    return { name: dir + segments.join('.'), format, locale };
  }

  return { name: unifiedPath, format };
}

/**
 * Returns the output format of a template name, its last extension.
 *
 * @param {string} name - The template name, i.e. `pages/invoice.html`.
 * @return {string} The lowercase format, i.e. `html`, or an empty string when the name has no extension.
 */
export function templateFormat(name: string): string {
  const fileName = name.slice(name.lastIndexOf('/') + 1);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Returns the MIME type of the content a template renders, derived from its format.
 *
 * @param {string} name - The template name or format, i.e. `exports/products.xml`.
 * @return {string} The MIME type, i.e. `application/xml`, or `text/plain` for an unknown format.
 */
export function templateMimeType(name: string): string {
  const format = templateFormat(name) || name.toLowerCase();
  return Object.hasOwn(TEMPLATE_MIME_TYPES, format)
    ? TEMPLATE_MIME_TYPES[format]
    : 'text/plain';
}

/**
 * Tells whether the values a template of the given format outputs are escaped as markup.
 *
 * @param {string} format - The template format, i.e. `html`.
 * @return {boolean} `true` for the HTML and XML formats, otherwise `false`.
 */
export function isEscapedTemplateFormat(format: string): boolean {
  return ESCAPED_FORMATS.has(format.toLowerCase());
}

/**
 * Returns the `Content-Type` of a rendered template, its MIME type with the UTF-8 charset, i.e.
 * `reply.type(templateContentType(name)).send(content)`.
 *
 * @param {string} name - The template name or format, i.e. `pages/invoice.html`.
 * @return {string} The content type, i.e. `text/html; charset=utf-8`.
 */
export function templateContentType(name: string): string {
  return `${templateMimeType(name)}; charset=utf-8`;
}
