import fsp from 'node:fs/promises';
import path from 'node:path';
import Handlebars, { TemplateDelegate } from 'handlebars';
import {
  ErrorCode,
  isEscapedTemplateFormat,
  isLocaleTag,
  logger,
  parseTemplatePath,
  TemplateData,
  TemplateEngine,
  TemplateHelper,
  TemplateRenderOptions,
  TemplateStringRenderOptions,
  templateFormat,
  appConfig,
  TemplateError
} from '@appweaver/common';
import {
  inject,
  LocaleService,
  moduleDirectories,
  templateConfig
} from '@appweaver/core';
import { createHandlebarsHelpers } from './handlebars-helpers';

const TEMPLATE_EXTENSIONS = ['.hbs', '.handlebars'];

/** Whether the values a template outputs are escaped as markup, or written as they are. */
type EscapeMode = 'escaped' | 'raw';

type TemplateEntry = {
  source: string;
  format: string;
  compiled: Partial<Record<EscapeMode, TemplateDelegate>>;
};

/** The templates of a source keyed by name, then by locale, the empty locale holding the template without one. */
type TemplateLayer = Map<string, Map<string, TemplateEntry>>;

export class HandlebarsTemplateEngine extends TemplateEngine {
  /** @internal */
  private readonly _localeService = inject(LocaleService);
  /** @internal */
  private readonly _handlebars: Record<EscapeMode, typeof Handlebars> = {
    escaped: Handlebars.create(),
    raw: Handlebars.create()
  };
  /** @internal */
  private readonly _registered: TemplateLayer = new Map();
  /** @internal */
  private _files: TemplateLayer = new Map();
  /** @internal */
  private _loading?: Promise<void>;
  /** @internal */
  private readonly _partials = new Map<
    string,
    Record<string, TemplateDelegate>
  >();
  /** @internal */
  private _variantLocales?: Set<string>;

  constructor() {
    super();
    const helpers = createHandlebarsHelpers(this._localeService);
    for (const [name, helper] of Object.entries(helpers)) {
      this.registerHelper(name, helper);
    }
  }

  public async onInit(): Promise<void> {
    await this.load();
  }

  public async render(
    name: string,
    data: TemplateData = {},
    options: TemplateRenderOptions = {}
  ): Promise<string> {
    await this.load();

    const locales = this._localeService.resolveLocales(options.locale);
    const entry = this.findTemplate(name, locales);
    if (!entry) {
      throw new TemplateError(
        ErrorCode.TemplateNotFound,
        `Template '${name}' not found`,
        { template: name, locale: locales[0] }
      );
    }

    return this.execute(name, entry, data, locales);
  }

  public async renderString(
    source: string,
    data: TemplateData = {},
    options: TemplateStringRenderOptions = {}
  ): Promise<string> {
    await this.load();

    const locales = this._localeService.resolveLocales(options.locale);
    const entry: TemplateEntry = {
      source,
      format: (options.format ?? 'html').toLowerCase(),
      compiled: {}
    };

    return this.execute('<string>', entry, data, locales);
  }

  public async hasTemplate(name: string, locale?: string): Promise<boolean> {
    await this.load();
    const locales = this._localeService.resolveLocales(locale);
    return this.findTemplate(name, locales) !== undefined;
  }

  public registerTemplate(name: string, source: string, locale?: string): void {
    if (locale !== undefined && !isLocaleTag(locale.replace(/_/g, '-'))) {
      throw new TemplateError(
        ErrorCode.TemplateLoadFailed,
        `Template '${name}' has an invalid locale '${locale}'`,
        { path: name }
      );
    }
    parseTemplate(name, source);
    addTemplate(this._registered, name, source, locale);
    this.clearPartials();
  }

  public registerHelper(name: string, helper: TemplateHelper): void {
    this._handlebars.escaped.registerHelper(name, helper);
    this._handlebars.raw.registerHelper(name, helper);
  }

  /** @internal */
  private load(): Promise<void> {
    if (!this._loading || !templateConfig.CACHE) {
      // Without the cache, reload the translations too
      if (this._loading) {
        this._localeService.reload();
      }
      this._loading = this.loadFiles().catch((e) => {
        this._loading = undefined;
        throw e;
      });
    }
    return this._loading;
  }

  /** @internal */
  private async loadFiles(): Promise<void> {
    const files: TemplateLayer = new Map();

    // The templates of the application override the ones of the modules
    for (const dir of [
      ...moduleDirectories('templates'),
      path.resolve(process.cwd(), templateConfig.PATH)
    ]) {
      await readTemplateFiles(dir, files);
    }

    this._files = files;
    this.clearPartials();
  }

  /** @internal */
  private findTemplate(
    name: string,
    locales: string[]
  ): TemplateEntry | undefined {
    const layers = [this._registered, this._files];
    for (const locale of [...locales, '']) {
      for (const layer of layers) {
        const entry = layer.get(name)?.get(locale);
        if (entry) {
          return entry;
        }
      }
    }
    return undefined;
  }

  /** @internal */
  private execute(
    name: string,
    entry: TemplateEntry,
    data: TemplateData,
    locales: string[]
  ): string {
    const mode: EscapeMode = isEscapedTemplateFormat(entry.format)
      ? 'escaped'
      : 'raw';

    try {
      const template = this.compile(entry, mode);
      return template(data, {
        data: {
          locale: locales[0],
          app: {
            name: appConfig.NAME,
            description: appConfig.DESCRIPTION,
            hostname: appConfig.HOSTNAME,
            version: appConfig.VERSION
          }
        },
        partials: this.partials(mode, entry.format, locales)
      });
    } catch (e) {
      throw new TemplateError(
        ErrorCode.TemplateRenderFailed,
        `Template '${name}' rendering failed`,
        { template: name },
        { cause: e }
      );
    }
  }

  /** @internal */
  private compile(entry: TemplateEntry, mode: EscapeMode): TemplateDelegate {
    entry.compiled[mode] ??= this._handlebars[mode].compile(entry.source, {
      noEscape: mode === 'raw'
    });
    return entry.compiled[mode];
  }

  /**
   * Every template is a partial included by its name, i.e. `{{> partials/button.html}}`, or by its name without the
   * format, which prefers the format of the including template, i.e. `{{> partials/button}}`. The partials resolve
   * to the variants of the rendered locale.
   *
   * @internal
   */
  private partials(
    mode: EscapeMode,
    format: string,
    locales: string[]
  ): Record<string, TemplateDelegate> {
    // Keyed by the locales having template variants only, so a requested
    // locale without any keeps the cache bounded
    const variantLocales = this.variantLocales();
    const key = [
      mode,
      format,
      ...locales.filter((locale) => variantLocales.has(locale))
    ].join('|');
    const cached = this._partials.get(key);
    if (cached) {
      return cached;
    }

    const names = new Set([...this._files.keys(), ...this._registered.keys()]);

    const partials: Record<string, TemplateDelegate> = {};
    const aliases = new Map<string, string>();

    for (const name of names) {
      const entry = this.findTemplate(name, locales);
      if (!entry) {
        continue;
      }
      const partial = this.compile(entry, mode);
      partials[name] = partial;

      const nameFormat = templateFormat(name);
      if (nameFormat) {
        const alias = name.slice(0, -(nameFormat.length + 1));
        // The format of the including template wins over any other format
        if (!aliases.has(alias) || nameFormat === format) {
          aliases.set(alias, name);
        }
      }
    }

    for (const [alias, name] of aliases) {
      partials[alias] ??= partials[name];
    }

    this._partials.set(key, partials);
    return partials;
  }

  /** @internal */
  private variantLocales(): Set<string> {
    if (!this._variantLocales) {
      this._variantLocales = new Set();
      for (const layer of [this._registered, this._files]) {
        for (const variants of layer.values()) {
          for (const locale of variants.keys()) {
            this._variantLocales.add(locale);
          }
        }
      }
    }
    return this._variantLocales;
  }

  /** @internal */
  private clearPartials(): void {
    this._partials.clear();
    this._variantLocales = undefined;
  }
}

/** Checks the syntax of a template, so an invalid one fails when it is loaded instead of when it is rendered. */
function parseTemplate(name: string, source: string): void {
  try {
    Handlebars.parse(source);
  } catch (e) {
    throw new TemplateError(
      ErrorCode.TemplateLoadFailed,
      `Template '${name}' is invalid`,
      { path: name },
      { cause: e }
    );
  }
}

/** Reads the template files of a directory into a layer, replacing the templates of the same name and locale. */
async function readTemplateFiles(
  dir: string,
  files: TemplateLayer
): Promise<void> {
  let fileNames: string[];
  try {
    fileNames = await fsp.readdir(dir, { recursive: true });
  } catch {
    logger.debug({ dir }, 'Template directory not found');
    fileNames = [];
  }

  for (const fileName of fileNames) {
    const extension = TEMPLATE_EXTENSIONS.find((ext) => fileName.endsWith(ext));
    if (!extension) {
      continue;
    }

    const filePath = path.join(dir, fileName);
    let source: string;
    try {
      // An editor ends a file with a line break, which would otherwise be
      // written after every included partial
      source = (await fsp.readFile(filePath, 'utf8')).replace(/\r?\n$/, '');
    } catch (e) {
      throw new TemplateError(
        ErrorCode.TemplateLoadFailed,
        `Template file '${filePath}' loading failed`,
        { path: filePath },
        { cause: e }
      );
    }

    parseTemplate(filePath, source);
    const parsed = parseTemplatePath(fileName.slice(0, -extension.length));
    addTemplate(files, parsed.name, source, parsed.locale);
  }
}

/** Adds a template of a name and locale to a layer, replacing the existing one. */
function addTemplate(
  layer: TemplateLayer,
  name: string,
  source: string,
  locale?: string
): void {
  const templateName = name.replace(/\\/g, '/').replace(/^\.?\//, '');
  const tag = locale
    ? Intl.getCanonicalLocales(locale.replace(/_/g, '-'))[0]
    : '';

  let variants = layer.get(templateName);
  if (!variants) {
    variants = new Map();
    layer.set(templateName, variants);
  }
  variants.set(tag, {
    source,
    format: templateFormat(templateName),
    compiled: {}
  });
}
