# Templates & Localization

Templates and localization are two independent features, each usable without the other:

- **Templates**: the template engine renders text of any format from template files: email bodies, HTML pages, XML
  documents for external integrations, CSV or any other text. `TemplateEngine` is an optional infrastructure provider of
  `@appweaver/common`, the default implementation is `HandlebarsTemplateEngine`
  ([Handlebars](https://handlebarsjs.com/guide/)), replaceable with `TEMPLATE_PROVIDER`. It needs the `handlebars`
  package, a companion package the project installs (`weaver update` keeps it in step).
- **Localization**: the locale service translates the keys of nested JSON files into a locale, anywhere in the
  application and, with the `t` helper, inside the templates. `LocaleService` is a core service of `@appweaver/core`,
  always available. Without a `locales/` directory it translates only the framework's own English `emails.*` keys.

The locale is always given by the application (a request parameter, a user field, ...), falling back to
`LOCALE_DEFAULT`. It also picks the localized template variants and the locale of the date and number helpers, so a
project without translation files can still render localized templates.

`create-weaver-app` scaffolds both, and skips either one with its flag:

| Flags                         | `templates/`, `handlebars`                     | `locales/` | Account emails                        |
|-------------------------------|------------------------------------------------|------------|---------------------------------------|
| (none)                        | Scaffolded, the texts translated with `{{t}}`  | `en.json`  | Rendered from the localized templates |
| `--no-locales`                | Scaffolded, the English texts written in place | —          | Rendered from the English templates   |
| `--no-templates`              | —, `TEMPLATE_PROVIDER` is empty                | `en.json`  | Plain text of the `en.json` texts     |
| `--no-templates --no-locales` | —, `TEMPLATE_PROVIDER` is empty                | —          | Plain text of the framework's texts   |

With `--no-locales`, every `{{t "key" param=value}}` of the scaffolded templates is replaced by the English message of
the key, its parameters by the expressions (`{{@app.name}}`) and a plural by an `{{#if (eq count 1)}}` chain, so the
templates render the same text. Localization can be added later by creating `locales/` and calling `t` again.

Both directories live in the project root next to `public/`, outside `src/`, so they are read the same way from the
Node build and the Bun sources. A Docker image copies each of them next to `dist/`. `weaver start --watch` restarts the
server when a file of either changes, and ignores a directory that does not exist.

## Templates

Like the Redis and queue providers, the template engine is loaded only when its package is installed: without
`handlebars` the application logs that the provider failed to load and starts without it. Injecting `TemplateEngine`
then throws `CONTEXT_DEFINITION_MISSING`, sending a template email fails with `CONFIGURATION_INVALID`, and the account
emails are sent as plain text built from the `emails.*` translations, as they are when the application has no template
for them. An empty `TEMPLATE_PROVIDER` loads no engine, without the warning. `EmailService.sendEmail` sends an email the
application built itself, i.e. of an HTML body stored in the database, with or without the engine.

### Project layout

```text
templates/                         # TEMPLATE_PATH
├── layouts/
│   ├── email.html.hbs             # the layout of the account emails, scaffolded
│   └── page.html.hbs
├── partials/
│   ├── tag-list.html.hbs
│   └── signature.txt.hbs
├── emails/
│   ├── password-reset.html.hbs    # an account email, see mailer.md
│   ├── order-shipped.html.hbs
│   ├── order-shipped.txt.hbs
│   ├── order-shipped.subject.hbs
│   └── order-shipped.de.html.hbs  # whole template localized for `de`
├── pages/invoice.html.hbs
└── exports/orders.xml.hbs
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
to other locales is not found in the default one. The variants need no translation files.

### Rendering

```ts
import { inject } from '@appweaver/core';
import { TemplateEngine } from '@appweaver/common';

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

The templates are loaded when the application starts, failing with `TEMPLATE_LOAD_FAILED` on a template of an invalid
syntax. The line break ending a template file is dropped, so an included partial adds none. `TEMPLATE_CACHE: false`
(set for the `dev` environment of a scaffolded project) reloads the changed templates and translation files on every
render.

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

The locale-aware helpers use `@locale`, the options of the `Intl` helpers are given as hash arguments. The `t` helper
translates with the locale service, see [Localization](#localization).

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

A custom helper reads the rendered locale from `options.data.locale`, i.e. to format amounts kept in cents:

```ts
registerTemplateHelper('money', (cents: number, options: { data?: { locale?: string } }) =>
  new Intl.NumberFormat(options.data?.locale, { style: 'currency', currency: 'EUR' }).format(cents / 100)
);
```

### Previewing templates

The preview route renders a template as the application would, to check it in a browser while editing it. It is
disabled by default; enable it only in the `dev` environment of `appweaver.json`. It is open to anyone by default, set
`auth` to `true` to require authentication, i.e. on a shared development server:

```json
{
  "environments": {
    "dev": {
      "template": {
        "cache": false,
        "preview": {
          "enabled": true
        }
      }
    }
  }
}
```

The startup logs the route, i.e. `Template preview enabled on '/templates/*'`.

`GET <TEMPLATE_PREVIEW_ROUTE_PREFIX>/<template name>` (`/templates/...` by default) responds with the rendered template
and the content type of its format. The query parameters are the template data:

- a dotted name sets a nested value, and a numeric part an item of a list: `order.number=WS-1&order.items.0.name=Book`
- a repeated parameter sets a list of values: `tags=news&tags=sport`
- `true`, `false`, `null` and the numbers written the way they print (`12`, `-0.5`, not `012`) get their type, every
  other value stays a string
- `_data` holds a JSON object the other parameters are merged over, for data the parameters cannot express
- `_locale` selects the locale, i.e. the localized variants and the translations

```
/templates/emails/order-confirmation.html?_locale=de&order.number=WS-1&order.items.0.name=Book&order.items.0.quantity=2
/templates/exports/posts.xml?_data={"posts":[{"title":"Hello","slug":"hello"}]}
```

A missing template responds with `404 TEMPLATE_PREVIEW_NOT_FOUND`, and an invalid `_data` with `400 MALFORMED_REQUEST`.
The route requires authentication only when `TEMPLATE_PREVIEW_AUTH` is `true`, is left out of the OpenAPI document,
responds with `Content-Security-Policy: sandbox` so no script of a rendered page runs, and fails the startup when no
template engine is loaded (the `handlebars` package is not installed).

### Template configuration

| Key                             | Default                                                 | Description                                  |
|---------------------------------|---------------------------------------------------------|----------------------------------------------|
| `TEMPLATE_PATH`                 | `'./templates'`                                         | Directory of the template files              |
| `TEMPLATE_CACHE`                | `true`                                                  | Keep the templates in memory                 |
| `TEMPLATE_PREVIEW_ENABLED`      | `false`                                                 | Enable the preview route                     |
| `TEMPLATE_PREVIEW_AUTH`         | `true`                                                  | Require authentication for the preview route |
| `TEMPLATE_PREVIEW_ROUTE_PREFIX` | `'/templates'`                                          | URL prefix of the preview route              |
| `TEMPLATE_PROVIDER`             | `'@appweaver/core/template/handlebars-template-engine'` | Template engine implementation               |

### Template errors

| Code                         | Raised when                                                   |
|------------------------------|---------------------------------------------------------------|
| `TEMPLATE_NOT_FOUND`         | No template of the name exists in the locale or its fallbacks |
| `TEMPLATE_RENDER_FAILED`     | A template fails to compile or render, i.e. a missing partial |
| `TEMPLATE_LOAD_FAILED`       | A template cannot be read, or its syntax is invalid           |
| `TEMPLATE_PREVIEW_NOT_FOUND` | The preview route is asked for a template that does not exist |

### Custom template engine

Extend `TemplateEngine` of `@appweaver/common` and point `TEMPLATE_PROVIDER` to the module. The account emails render
the templates listed in [mailer.md](./mailer.md#account-emails) when the engine has them, otherwise they are sent as
plain text.

## Localization

`LocaleService` needs no package and no template engine: it translates in services, hooks, jobs and routes as well as in
the templates. A missing `locales/` directory leaves only the framework's own English keys (`emails.*`), which
translate the plain text of the account emails.

### Project layout

```text
locales/                           # LOCALE_PATH
├── en.json
├── de.json
└── de-AT.json                     # only the keys differing from de.json
```

### Translations

A translation file is a JSON object of nested objects and string messages, named by its locale (`locales/de.json`).
A message is translated by its dotted key, the path of its object names: `inbox.unread` below. A value that is neither
a string nor an object is ignored with a warning. Every translation is an
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) message, the syntax of FormatJS,
Angular, vue-i18n and Symfony, with the plural categories of the Unicode CLDR (`Intl.PluralRules`):

```json
{
  "inbox": {
    "greeting": "Hello {name}",
    "unread": "You have {msg_cnt, plural, =0 {no unread messages} one {# unread message} other {# unread messages}}"
  },
  "race": {
    "place": "You finished {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}"
  },
  "comment": {
    "replied": "{gender, select, female {She} male {He} other {They}} replied"
  },
  "order": {
    "total": "Total: {total, number} items"
  },
  "help": {
    "braces": "Write '{name}' to insert the name, it''s easy"
  }
}
```

| Syntax                                                        | Writes                                                            |
|---------------------------------------------------------------|-------------------------------------------------------------------|
| `{name}`                                                      | The parameter as it is                                            |
| `{n, plural, =0 {...} one {...} other {...}}`                 | The branch of the exact value, else of the plural category of `n` |
| `#`                                                           | The number of the enclosing plural, formatted in the locale       |
| `{n, plural, offset:1 ...}`                                   | The categories and `#` of `n - 1`, the exact values of `n`        |
| `{n, selectordinal, one {#st} two {#nd} ... other {#th}}`     | The branch of the ordinal category                                |
| `{value, select, a {...} b {...} other {...}}`                | The branch of the value                                           |
| `{n, number}`, `{n, number, integer}`, `{n, number, percent}` | The number formatted in the locale                                |
| `''`, `'{text}'`                                              | An apostrophe, the quoted text as it is (a lone `'` stays as is)  |

The categories differ by language: English has `one` and `other`, Croatian adds `few` (`2`-`4`), Arabic has all six
(`zero`, `one`, `two`, `few`, `many`, `other`). Every `plural`, `selectordinal` and `select` needs an `other` branch.
A message is checked when its file loads, failing with `LOCALE_LOAD_FAILED` on an invalid one, and an argument without
a parameter is written as it is, i.e. `{name}`. The plural forms follow the locale of the file the translation is found
in.

```ts
import { inject, LocaleService, registerTranslations } from '@appweaver/core';

const locales = inject(LocaleService);

locales.translate('inbox.unread', 'en', { msg_cnt: 1 }); // 'You have 1 unread message'
locales.translate('inbox.unread', 'hr', { msg_cnt: 3 }); // the `few` branch of hr.json
locales.hasTranslation('inbox.unread', 'hr');
locales.getLocales(); // ['de', 'en']
locales.resolveLocales('de-AT'); // ['de-AT', 'de', 'en']

// Translations defined in code, merged key by key over the file
registerTranslations('de', { cart: { checkout: 'Zur Kasse' } });
```

In a template, the hash arguments of `t` are the parameters: `{{t "inbox.unread" msg_cnt=user.unreadCount}}`.

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

### Choosing the locale

The framework never guesses the locale, the application passes it where it knows it. A common pattern, used by the
`webshop-api` sample, is a `language` field on the auth model, the preferred language of the user, copied onto the
records whose emails are sent later, so an email is written in the language the record was made in:

```ts
// src/resources/user/model.ts
const config = {
  language: {
    type: 'string',
    default: 'en',
    pattern: '^[a-z]{2}(-[A-Z]{2})?$',
    maxLength: 8
  }
};

// At checkout: the language asked for, or the preferred one of the customer
const order = await tx.order.create({ data: { ...data, language: request.language ?? customer.language } });

// Later, i.e. in a queue worker
await inject(EmailService).sendEmail({
  to: order.customer.email,
  template: 'emails/order-confirmed',
  data: { order, customer: order.customer },
  locale: order.language
});
```

### Locale configuration

| Key              | Default       | Description                        |
|------------------|---------------|------------------------------------|
| `LOCALE_DEFAULT` | `'en'`        | Locale used when none is given     |
| `LOCALE_PATH`    | `'./locales'` | Directory of the translation files |

### Locale errors

| Code                 | Raised when                                                   |
|----------------------|---------------------------------------------------------------|
| `LOCALE_LOAD_FAILED` | A translation file is not a JSON object, or a message invalid |
