# Mailer

The mailer module sends transactional emails. The default implementation (`SmtpMailer`) uses Nodemailer over SMTP. A
`JsonMailer` is available for development and tests — it returns a JSON representation of the email instead of sending
it.

## Injecting Mailer

Mailer is an optional infrastructure. Inject it with `required: false` to avoid errors when no mailer is configured.

```ts
import { inject } from '@appweaver/core';
import { Mailer } from '@appweaver/common';

const mailer = inject(Mailer, false); // undefined if not registered
```

---

#### `mailer.sendEmail(data)`

Sends an email. Returns `true` on success.

| Field         | Type           | Required | Description                               |
|---------------|----------------|----------|-------------------------------------------|
| `to`          | `string`       | Yes      | Recipient address                         |
| `subject`     | `string`       | Yes      | Email subject line                        |
| `text`        | `string`       | Yes      | Plain-text body                           |
| `html`        | `string`       | No       | HTML body (falls back to wrapping `text`) |
| `attachments` | `Attachment[]` | No       | Provider-specific attachment objects      |

```ts
await mailer.sendEmail({
  to: 'alice@example.com',
  subject: 'Welcome!',
  text: 'Thanks for signing up.',
  html: '<p>Thanks for <strong>signing up</strong>.</p>'
});
```

**With attachments** (Nodemailer format for SmtpMailer):

```ts
await mailer.sendEmail({
  to: 'bob@example.com',
  subject: 'Your invoice',
  text: 'Please find your invoice attached.',
  attachments: [
    { filename: 'invoice.pdf', path: '/tmp/invoice.pdf' }
  ]
});
```

---

#### `mailer.checkHealth()`

Verifies that the mail transport is reachable (`transporter.verify()` for SMTP). Returns a `HealthCheckResult`.

---

## Configuration

| Key                     | Type     | Default                                | Description                       |
|-------------------------|----------|----------------------------------------|-----------------------------------|
| `MAILER_PROVIDER`       | `string` | `'@appweaver/core/mailer/smtp-mailer'` | Path to the Mailer implementation |
| `MAILER_SENDER_NAME`    | `string` | —                                      | Display name of the sender        |
| `MAILER_SENDER_ADDRESS` | `string` | —                                      | From address                      |
| `MAILER_SMTP_HOST`      | `string` | `'127.0.0.1'`                          | SMTP server hostname              |
| `MAILER_SMTP_PORT`      | `int`    | `587`                                  | SMTP server port                  |
| `MAILER_SMTP_SECURE`    | `bool`   | `false`                                | Use TLS (`true` for port 465)     |
| `MAILER_SMTP_USER`      | `string` | —                                      | SMTP authentication username      |
| `MAILER_SMTP_PASSWORD`  | `string` | —                                      | SMTP authentication password      |

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

**Use `JsonMailer` in development or tests:**

```json
{
  "MAILER_PROVIDER": "@appweaver/core/mailer/json-mailer"
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
