# Templates & Locales

The template engine renders text of any format from template files: email bodies, HTML pages, XML documents for
external integrations, CSV or any other text. The locale service translates keys of flat JSON files into a locale,
usable anywhere in the application and inside the templates. The locale is always given by the application (a request
parameter, a user field, ...), falling back to `LOCALE_DEFAULT`.

- `TemplateEngine` is an optional infrastructure provider of `@appweaver/common`, the default implementation is
  `HandlebarsTemplateEngine` ([Handlebars](https://handlebarsjs.com/guide/)), replaceable with `TEMPLATE_PROVIDER`. It
  needs the `handlebars` package, a companion package the project installs (`weaver update` keeps it in step).
- `LocaleService` is a core service of `@appweaver/core`, always available.

Like the Redis and queue providers, the template engine is loaded only when its package is installed: without
`handlebars` the application logs that the provider failed to load and starts without it. Injecting `TemplateEngine`
then throws `CONTEXT_DEFINITION_MISSING`, `EmailService.sendTemplateEmail` fails, and the framework emails are sent as
plain text built from the `emails.*` translations. A project created with `create-weaver-app --no-templates` skips the
`handlebars` package and the `templates/` and `locales/` directories. `LocaleService` keeps translating, from the
`locales/` files when the project adds them.

## Project layout

Both directories live in the project root next to `public/`, outside `src/`, so they are read the same way from the
Node build and the Bun sources. A Docker image copies them next to `dist/`.

```text
templates/                         # TEMPLATE_PATH
├── layouts/
│   ├── email.html.hbs             # overrides the layout of the framework emails
│   └── page.html.hbs
├── partials/
│   ├── tag-list.html.hbs
│   └── signature.txt.hbs
├── emails/
│   ├── order-shipped.html.hbs
│   ├── order-shipped.txt.hbs
│   ├── order-shipped.subject.hbs
│   └── order-shipped.de.html.hbs  # whole template localized for `de`
├── pages/invoice.html.hbs
└── exports/orders.xml.hbs
locales/                           # LOCALE_PATH
├── en.json
├── de.json
└── de-AT.json                     # only the keys differing from de.json
```

### Template names

A file `<path>/<name>[.<locale>].<format>.hbs` (or `.handlebars`) is the template **`<path>/<name>.<format>`**, i.e.
`emails/order-shipped.de.html.hbs` is the `de` variant of `emails/order-shipped.html`. The segment before the format is
a locale only when it is a locale tag, so `feeds/posts.rss.xml.hbs` is the template `feeds/posts.rss.xml`.

The format decides the escaping and the MIME type:

| Format                                              | Values              |
|-----------------------------------------------------|---------------------|
| `html`, `htm`, `xhtml`, `xml`, `rss`, `atom`, `svg` | Escaped as markup   |
| Any other, i.e. `txt`, `csv`, `json`, `subject`     | Written as they are |

`templateMimeType(name)` of `@appweaver/common` returns the MIME type of a format (`text/html`, `application/xml`,
`text/csv`, ...), `text/plain` for a format it does not know.

Use `{{{value}}}` to write a value unescaped in a markup template.

### Locale variants and fallbacks

A render in `de-AT` looks a template up in `de-AT`, `de`, the default locale (and its language), then the template
without a locale. The same chain applies to the partials it includes and to the translations. A template only localized
to other locales is not found in the default one.

## Rendering

```ts
import { inject } from '@appweaver/core';
import { TemplateEngine, templateContentType } from '@appweaver/common';

const templates = inject(TemplateEngine);

const html = await templates.render('pages/invoice.html', { invoice }, { locale: 'de' });
const xml = await templates.render('exports/orders.xml', { orders, generatedAt: new Date() });
const text = await templates.renderString('Hi {{name}}', { name }, { format: 'txt' });
const exists = await templates.hasTemplate('emails/welcome.html', 'de');
```

| Method                                    | Description                                                                         |
|-------------------------------------------|-------------------------------------------------------------------------------------|
| `render(name, data?, { locale? })`        | Renders a template, rejecting with `TEMPLATE_NOT_FOUND` or `TEMPLATE_RENDER_FAILED` |
| `renderString(source, data?, options?)`   | Renders a source string, `format` (default `html`) decides the escaping             |
| `hasTemplate(name, locale?)`              | Whether the template exists in the locale or its fallbacks                          |
| `registerTemplate(name, source, locale?)` | Registers a template in code, taking precedence over the files                      |
| `registerHelper(name, helper)`            | Registers a helper                                                                  |

The templates are loaded when the application starts. `TEMPLATE_CACHE: false` (set for the `dev` environment of a
scaffolded project) reloads the changed files on every render.

### Returning a rendered template from a route

`templateContentType(name)` returns the `Content-Type` of a template's format, i.e. `text/html; charset=utf-8`. Declare
a `Type.String()` response and the produced MIME type, so the OpenAPI document describes it.

```ts
import { Type } from '@sinclair/typebox';
import { TemplateEngine, templateContentType } from '@appweaver/common';
import { inject, registerRoute } from '@appweaver/core';

registerRoute(
  (router) => {
    router.get(
      '/orders/export/xml',
      {
        schema: {
          querystring: Type.Object({ locale: Type.Optional(Type.String()) }),
          produces: ['application/xml'],
          response: { 200: Type.String() }
        }
      },
      async (req, reply) => {
        const name = 'exports/orders.xml';
        const xml = await inject(TemplateEngine).render(
          name,
          { orders: await findOrders(), generatedAt: new Date() },
          { locale: req.query.locale }
        );

        return reply
          .type(templateContentType(name))
          .header('Content-Disposition', 'attachment; filename="orders.xml"')
          .send(xml);
      }
    );
  },
  { roles: ['Admin'] }
);
```

## Handlebars templates

### Layouts and components

Every template is also a partial, included by its name, or by its name without the format, which prefers the format of
the including template (`{{> partials/signature}}` includes `partials/signature.txt.hbs` from a `.txt` template). A
layout or a component with content wraps it with `{{> @partial-block}}`:

```hbs
{{!-- templates/layouts/page.html.hbs --}}
<!DOCTYPE html>
<html lang="{{@locale}}">
  <head><title>{{title}} · {{@app.name}}</title></head>
  <body>{{> @partial-block}}</body>
</html>
```

```hbs
{{!-- templates/pages/invoice.html.hbs --}}
{{#> layouts/page.html title=(t "invoice.title" number=invoice.number)}}
  <h1>{{t "invoice.title" number=invoice.number}}</h1>
  <p>{{t "invoice.issued" date=(formatDate invoice.issuedAt "long")}}</p>
  {{#each invoice.lines}}
    {{> partials/invoice-line line=this}}
  {{/each}}
  <p>{{formatCurrency invoice.total invoice.currency}}</p>
{{/layouts/page.html}}
```

```hbs
{{!-- templates/exports/orders.xml.hbs --}}
<?xml version="1.0" encoding="UTF-8"?>
<orders generatedAt="{{formatDate generatedAt "iso"}}">
  {{#each orders}}
    <order id="{{id}}"><customer>{{customer.name}}</customer><note>{{cdata note}}</note></order>
  {{/each}}
</orders>
```

### Data variables

| Variable           | Value                                |
|--------------------|--------------------------------------|
| `@locale`          | The locale rendered in, i.e. `de-AT` |
| `@app.name`        | `APP_NAME`                           |
| `@app.description` | `APP_DESCRIPTION`                    |
| `@app.hostname`    | `APP_HOSTNAME`                       |
| `@app.version`     | `APP_VERSION`                        |

### Built-in helpers

The locale-aware helpers use `@locale`, the options of the `Intl` helpers are given as hash arguments.

| Helper                                    | Example                                                                            |
|-------------------------------------------|------------------------------------------------------------------------------------|
| `t key [locale] params...`                | `{{t "cart.items" count=items.length}}`                                            |
| `formatDate value [style\|"iso"] options` | `{{formatDate createdAt "long"}}`, `{{formatDate d month="short" timeZone="UTC"}}` |
| `formatNumber value options`              | `{{formatNumber ratio style="percent"}}`                                           |
| `formatCurrency value currency options`   | `{{formatCurrency total "EUR"}}`                                                   |
| `eq`, `ne`, `lt`, `lte`, `gt`, `gte`      | `{{#if (eq status "Paid")}}`                                                       |
| `and`, `or`, `not`                        | `{{#if (and active (not deleted))}}`                                               |
| `default value fallback`                  | `{{default nickname "Guest"}}`                                                     |
| `includes`, `length`                      | `{{#if (includes roles "Admin")}}`, `{{length items}}`                             |
| `add`, `subtract`, `multiply`, `divide`   | `{{multiply price quantity}}`                                                      |
| `uppercase`, `lowercase`, `trim`          | `{{uppercase code}}`                                                               |
| `truncate value length [suffix]`          | `{{truncate excerpt 100}}`                                                         |
| `join array [separator]`, `concat`        | `{{join tags ", "}}`, `{{concat first " " last}}`                                  |
| `json value [indent]`                     | `{{{json payload}}}`                                                               |
| `cdata value`                             | `<note>{{cdata note}}</note>`                                                      |

### Custom helpers and templates

Register them from a module the application loads, i.e. `src/features/index.ts`:

```ts
import { registerTemplate, registerTemplateHelper, registerTemplateHelpers } from '@appweaver/core';

registerTemplateHelper('initials', (name: string) =>
  name.split(' ').map((part) => part[0]).join('')
);

// Several helpers at once, i.e. of a helper library the application installs
registerTemplateHelpers(myHelpers);

// A template defined in code, i.e. loaded from the database
registerTemplate('emails/promo.html', source, 'de');
```

## Translations

A translation file is a **flat** JSON object of string values, named by its locale (`locales/de.json`). The keys are
plain strings, dots only group them by convention. Placeholders are `{name}`, a numeric `count` also selects the plural
form of the locale (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other` suffixes, `Intl.PluralRules`).

```json
{
  "cart.items_zero": "Your cart is empty",
  "cart.items_one": "{count} item",
  "cart.items_other": "{count} items",
  "category.defaultDescription": "Posts about {name}."
}
```

```ts
import { inject, LocaleService, registerTranslations } from '@appweaver/core';

const locales = inject(LocaleService);

locales.translate('cart.items', 'de', { count: 3 }); // the `cart.items_other` key of de.json
locales.translate('cart.items', undefined, { count: 0 }); // LOCALE_DEFAULT: 'Your cart is empty'
locales.hasTranslation('cart.items', 'hr');
locales.getLocales(); // ['de', 'en']
locales.resolveLocales('de-AT'); // ['de-AT', 'de', 'en']

// Translations defined in code, merged over the file
registerTranslations('de', { 'cart.checkout': 'Zur Kasse' });
```

A missing key returns the key itself. The framework's own keys (`emails.*`) fall back to their English text.

### Translating in a service hook

```ts
import { createService, inject, LocaleService } from '@appweaver/core';

export default createService({
  modelName: 'Category',
  beforeCreate: (data) => {
    data.description ??= inject(LocaleService).translate(
      'category.defaultDescription',
      undefined, // LOCALE_DEFAULT
      { name: data.name }
    );
  }
});
```

## Configuration

| Key                 | Default                                                 | Description                        |
|---------------------|---------------------------------------------------------|------------------------------------|
| `TEMPLATE_PATH`     | `'./templates'`                                         | Directory of the template files    |
| `TEMPLATE_CACHE`    | `true`                                                  | Keep the templates in memory       |
| `TEMPLATE_PROVIDER` | `'@appweaver/core/template/handlebars-template-engine'` | Template engine implementation     |
| `LOCALE_DEFAULT`    | `'en'`                                                  | Locale used when none is given     |
| `LOCALE_PATH`       | `'./locales'`                                           | Directory of the translation files |

## Errors

| Code                     | Raised when                                                   |
|--------------------------|---------------------------------------------------------------|
| `TEMPLATE_NOT_FOUND`     | No template of the name exists in the locale or its fallbacks |
| `TEMPLATE_RENDER_FAILED` | A template fails to compile or render, i.e. a missing partial |
| `TEMPLATE_LOAD_FAILED`   | A template file cannot be read                                |
| `LOCALE_LOAD_FAILED`     | A translation file is not valid JSON or not a JSON object     |

## Custom template engine

Extend `TemplateEngine` of `@appweaver/common` and point `TEMPLATE_PROVIDER` to the module. The framework emails need
the templates listed in [mailer.md](./mailer.md#built-in-account-emails), which an engine registers itself.
