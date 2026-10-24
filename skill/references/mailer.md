# Mailer

The mailer module sends transactional emails. Its driver `SmtpMailer` (provider `smtp`) of `@appweaver/nodemailer` uses
Nodemailer over SMTP and is selected when the package is installed. The `JsonMailer` of core (provider `json`, selected
by name only) writes the emails into the log instead of sending them, for development and tests. Without a driver, or
with `MAILER_PROVIDER=none`, no `Mailer` and no `EmailService` are defined, and the email features (email verification,
password reset, 2FA) respond with `501`.

## Injecting Mailer

Mailer is an optional infrastructure. Inject it with `required: false` to avoid errors when no mailer is selected.

```ts
import { inject } from '@appweaver/core';
import { Mailer } from '@appweaver/common';

const mailer = inject(Mailer, false); // undefined if not registered
```

---

#### `mailer.sendEmail(data)`

Sends an email. Returns `true` on success.

| Field             | Type                      | Required | Description                                                                 |
|-------------------|---------------------------|----------|-----------------------------------------------------------------------------|
| `to`              | `string \| string[]`      | Yes      | Recipient addresses, i.e. `jane@example.com` or `"Jane" <jane@example.com>` |
| `subject`         | `string`                  | Yes      | Email subject line                                                          |
| `text`            | `string`                  | Yes      | Plain-text body                                                             |
| `html`            | `string`                  | No       | HTML body (falls back to the escaped `text`)                                |
| `from`            | `string`                  | No       | Sender, `"MAILER_SENDER_NAME" <MAILER_SENDER_ADDRESS>` by default           |
| `cc`, `bcc`       | `string \| string[]`      | No       | Copy recipients                                                             |
| `replyTo`         | `string`                  | No       | Reply-to address                                                            |
| `headers`         | `Record<string, string>`  | No       | Additional headers                                                          |
| `attachments`     | `EmailAttachment[]`       | No       | Attached files, the same shape for every mailer (below)                     |
| `providerOptions` | `Record<string, unknown>` | No       | Options of the driver, i.e. passed to `sendMail` by `smtp`                  |

The sender, recipients, headers, attachments and `providerOptions` form the `EmailEnvelope` type, shared by `Email` and
`TemplateEmail`. An `EmailAttachment` is `{ filename, content, contentType?, encoding? }`, where `content` is a
`string` or a `Buffer` and `encoding` is `'base64'` or `'utf8'` for a string. An email sent through the queue of
`EmailService` keeps binary content as a `base64` string with `encoding: 'base64'`.

```ts
await mailer.sendEmail({
  to: 'alice@example.com',
  subject: 'Welcome!',
  text: 'Thanks for signing up.',
  html: '<p>Thanks for <strong>signing up</strong>.</p>'
});
```

**With attachments:**

```ts
await mailer.sendEmail({
  to: ['bob@example.com', 'carol@example.com'],
  replyTo: 'billing@example.com',
  subject: 'Your invoice',
  text: 'Please find your invoice attached.',
  attachments: [
    { filename: 'invoice.pdf', content: pdf.toString('base64'), encoding: 'base64', contentType: 'application/pdf' }
  ]
});
```

---

#### `mailer.checkHealth()`

Verifies that the mail transport is reachable (`transporter.verify()` for SMTP). Returns a `HealthCheckResult`.

---

## Configuration

| Key                     | Type     | Default       | Description                                                                                            |
|-------------------------|----------|---------------|--------------------------------------------------------------------------------------------------------|
| `MAILER_PROVIDER`       | `string` | `'auto'`      | `auto` (`smtp` with `@appweaver/nodemailer`, otherwise none), `smtp`, `json`, `none`, or a module path |
| `MAILER_SENDER_NAME`    | `string` | —             | Display name of the default sender                                                                     |
| `MAILER_SENDER_ADDRESS` | `string` | —             | Address of the default sender                                                                          |
| `MAILER_SMTP_HOST`      | `string` | `'127.0.0.1'` | SMTP server hostname                                                                                   |
| `MAILER_SMTP_PORT`      | `int`    | `587`         | SMTP server port                                                                                       |
| `MAILER_SMTP_SECURE`    | `bool`   | `false`       | Use TLS (`true` for port 465)                                                                          |
| `MAILER_SMTP_USER`      | `string` | —             | SMTP authentication username                                                                           |
| `MAILER_SMTP_PASSWORD`  | `string` | —             | SMTP authentication password                                                                           |

**`appweaver.json` example:**

```json
{
  "MAILER_SENDER_NAME": "My App",
  "MAILER_SENDER_ADDRESS": "no-reply@myapp.com",
  "MAILER_SMTP_HOST": "smtp.mailgun.org",
  "MAILER_SMTP_PORT": 587,
  "MAILER_SMTP_USER": "postmaster@mg.myapp.com",
  "MAILER_SMTP_PASSWORD": "secret"
}
```

**Use `JsonMailer` in the tests:**

```json
{
  "environments": {
    "test": { "mailer": { "provider": "json" } }
  }
}
```

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import { Mailer } from '@appweaver/common';

export class AuthService {
  private readonly _mailer = inject(Mailer, false);

  async sendPasswordReset(email: string, token: string): Promise<void> {
    if (!this._mailer) return; // mailer not configured, skip silently

    await this._mailer.sendEmail({
      to: email,
      subject: 'Reset your password',
      text: `Use this token to reset your password: ${token}`,
      html: `<p>Use this token to reset your password: <strong>${token}</strong></p>`
    });
  }
}
```

---

## EmailService

`EmailService` is a higher-level wrapper around `Mailer` that routes all emails through the `Queue` infrastructure. This
decouples the caller from the SMTP transport, provides retry semantics, and avoids blocking the request thread on email
delivery.

Inject it like any other service. It is defined whenever a `Mailer` and a `Queue` are, so inject it with
`required: false` in code that must also run without a mailer.

```ts
import { EmailService, inject } from '@appweaver/core';
```

Every send method takes an `Email` built by the caller or a [`TemplateEmail`](#template-emails) (one with a
`template` field), which it renders from the templates of the application before queueing it.

---

#### `emailService.sendEmail(email)`

Fire-and-forget. Adds the email to the queue and returns immediately — delivery happens asynchronously.

```ts
await emailService.sendEmail({
  to: 'alice@example.com',
  subject: 'Welcome!',
  text: 'Thanks for signing up.',
  html: '<p>Thanks for <strong>signing up</strong>.</p>'
});
```

---

#### `emailService.sendEmailAndWait(email)`

Queues the email and resolves only once delivery succeeds, or rejects if it fails. Use this when you need a delivery
confirmation before proceeding (e.g., before returning a 200 to the client).

Returns `true` on success.

```ts
const sent = await emailService.sendEmailAndWait({
  to: 'bob@example.com',
  subject: 'Your invoice',
  text: 'Please find your invoice attached.',
  attachments: [{ filename: 'invoice.pdf', content: pdf.toString('base64'), encoding: 'base64' }]
});
```

---

#### `emailService.sendEmailBulk(emails)`

Queues all emails at once without waiting for any to finish. Prefer this when sending a large batch and delivery
confirmation is not required. The template emails are rendered first, and one that fails to render is logged as an
error and left out, the others are still queued.

```ts
await emailService.sendEmailBulk(
  users.map((u) => ({
    to: u.email,
    subject: 'New feature announcement',
    text: `Hi ${u.name}, we just shipped something new...`
  }))
);
```

---

#### `emailService.sendEmailBulkAndWait(emails)`

Queues all emails and waits for every delivery attempt to settle. Returns an array of
`{ success: boolean; error?: Error }` in the same order as the input — failed deliveries do not reject the whole call,
and neither does a template email that fails to render, reported as a failed result while the others are still sent.

```ts
const results = await emailService.sendEmailBulkAndWait(emails);

for (const [i, result] of results.entries()) {
  if (!result.success) {
    logger.error(result.error, `Failed to deliver email to ${emails[i].to}`);
  }
}
```

---

#### Template emails

A `TemplateEmail` passed to any send method is rendered from the templates of the [template engine](./templates.md) in
the given locale. The `template` is a name without the format, its templates render the parts of the email:

| Template             | Renders             | Required                                    |
|----------------------|---------------------|---------------------------------------------|
| `<template>.html`    | The HTML body       | No, the escaped text body when missing      |
| `<template>.txt`     | The plain text body | No, derived from the HTML body when missing |
| `<template>.subject` | The subject         | Unless `subject` is given                   |

| Field      | Type                 | Required | Description                                                   |
|------------|----------------------|----------|---------------------------------------------------------------|
| `to`       | `string \| string[]` | Yes      | Recipient addresses                                           |
| `template` | `string`             | Yes      | Template name without the format, i.e. `emails/order-shipped` |
| `data`     | `object`             | No       | The data the templates render                                 |
| `locale`   | `string`             | No       | The locale to render in, `LOCALE_DEFAULT` by default          |
| `subject`  | `string`             | No       | Used instead of the `.subject` template                       |

The other fields of the `EmailEnvelope` (`from`, `cc`, `bcc`, `replyTo`, `headers`, `attachments`, `providerOptions`)
are passed on to the rendered email.

```text
templates/emails/
├── order-shipped.html.hbs
├── order-shipped.txt.hbs          # optional, i.e. for a table laid out as text
└── order-shipped.subject.hbs      # {{t "emails.orderShipped.subject" number=order.number}}
```

```ts
await emailService.sendEmail({
  to: customer.email,
  template: 'emails/order-shipped',
  data: { order, trackingUrl },
  locale: customer.language // decided by the application
});
```

`emailService.renderTemplateEmail(email)` returns the rendered `Email` without sending it, i.e. to check it in a test.
An email needs one of the body templates, without both or without a subject it rejects with `TEMPLATE_NOT_FOUND`, and
without a loaded template engine with `CONFIGURATION_INVALID`.

### Account emails

The account routes send their emails from the templates of the application, always in `LOCALE_DEFAULT`. To send one
in another locale, call `AccountService` directly: `sendEmailVerification`, `sendResetPassword` and `send2FACode` take
the locale as their last argument. The framework ships no templates of its own:

| Template                 | Data                                           |
|--------------------------|------------------------------------------------|
| `emails/verify-email`    | `email`, `link`                                |
| `emails/password-reset`  | `email`, `link`                                |
| `emails/two-factor-code` | `email`, `code`, `purpose`, `expiresInMinutes` |

An email is rendered when its `.html` or `.txt` template exists, with the translated `emails.<email>.subject` key when
it has no `.subject` template. Without a template, or without the `@appweaver/handlebars` package, it is sent as plain
text built from the `emails.*` translations, which the framework defines in English and `locales/<locale>.json`
overrides.

A project scaffolded with the `mailer`, `templates` and `locales` modules starts with the `.html` and `.subject`
templates of all three emails in `templates/emails/`, sharing the `layouts/email.html` layout and the
`partials/email-button.html` partial, and with their English keys in `locales/en.json`. Their plain text is derived from
the HTML, add a `.txt` template only for a text that should read differently. Edit them freely, or delete them to send
the plain text. Without the `locales` module, the templates hold the English texts themselves and there is no `locales/`
directory; without the `templates` module, the emails are sent as plain text of `locales/en.json`. Removing the `mailer`
module (`weaver module remove mailer`) deletes these templates, and without `@appweaver/nodemailer` no mailer is
selected. See [templates.md](./templates.md).

---

### Real-world example — post-registration flow

```ts
import { EmailService, inject } from '@appweaver/core';

export class RegistrationService {
  private readonly _emailService = inject(EmailService);

  async register(user: { email: string; name: string }): Promise<void> {
    // ... persist user to DB ...

    // Send welcome email and wait for confirmation before returning
    await this._emailService.sendEmailAndWait({
      to: user.email,
      subject: 'Welcome to MyApp!',
      text: `Hi ${user.name}, your account is ready.`,
      html: `<p>Hi <strong>${user.name}</strong>, your account is ready.</p>`
    });
  }

  async notifyAdmins(admins: { email: string }[], message: string): Promise<void> {
    // Blast all admin notifications without blocking
    await this._emailService.sendEmailBulk(
      admins.map((a) => ({
        to: a.email,
        subject: 'Admin notification',
        text: message
      }))
    );
  }
}
```
