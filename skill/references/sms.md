# SMS

The SMS module sends text messages: the SMS 2FA codes, the phone verification codes, and any message of the
application. Its driver `TwilioSms` (provider `twilio`) of `@appweaver/twilio` calls the REST API of Twilio and is
selected when the package is installed. The `JsonSms` of core (provider `json`, selected by name only) writes the
messages into the log at `debug` (the `sms` logger) instead of sending them, for development and tests. Without a
driver, or with `SMS_PROVIDER=none`, no `SmsSender` and no `SmsService` are defined, the SMS 2FA method is unavailable,
and the phone verification responds with `501`.

## SmsService

`SmsService` of `@appweaver/core` sends every message through the `sms` queue, so a message failing for a transient
reason is retried with the `queue.retryAttempts` and `queue.retryBackoff` of the queue. It is defined with an
`SmsSender` and a `Queue` (the in-memory one when no queue driver is installed), so inject it optionally:

```ts
import { inject, SmsService } from '@appweaver/core';

const smsService = inject(SmsService, false); // undefined without an SMS sender
```

| Method                         | Returns                          | Description                                                                                |
|--------------------------------|----------------------------------|--------------------------------------------------------------------------------------------|
| `sendSms(sms)`                 | `Promise<void>`                  | Queues the message and resolves once it is queued.                                         |
| `sendSmsBulk(messages)`        | `Promise<void>`                  | Queues the messages at once. A template message failing to render is logged and left out.  |
| `sendSmsAndWait(sms)`          | `Promise<boolean>`               | Queues the message and resolves once it is sent, rejects with the error of its last retry. |
| `sendSmsBulkAndWait(messages)` | `Promise<{ success, error? }[]>` | Sends the messages and reports the result of each one, in their order.                     |
| `renderTemplateSms(sms)`       | `Promise<SmsMessage>`            | Renders a template message into the message to send, which the send methods do themselves. |

Every method takes an `SmsMessage` or a `TemplateSms`:

| Field             | Type                      | Required | Description                                                                      |
|-------------------|---------------------------|----------|----------------------------------------------------------------------------------|
| `to`              | `string`                  | Yes      | Recipient phone number in the E.164 format, i.e. `+385911234567`                 |
| `text`            | `string`                  | Yes      | The text, of an `SmsMessage`                                                     |
| `template`        | `string`                  | Yes      | The template without the format, of a `TemplateSms`, i.e. `sms/order-shipped`    |
| `data`            | `Record<string, any>`     | No       | The data to render the template with                                             |
| `locale`          | `string`                  | No       | The locale to render the template in, `LOCALE_DEFAULT` by default                |
| `from`            | `string`                  | No       | Sender, a phone number or an alphanumeric sender ID, `SMS_SENDER` by default     |
| `providerOptions` | `Record<string, unknown>` | No       | Options of the driver, i.e. the extra parameters of the Twilio Messages resource |

```ts
await smsService.sendSms({ to: '+385911234567', text: 'Your order has shipped.' });

// Waits for the provider, i.e. to answer a request with a rejected number
await smsService.sendSmsAndWait({
  to: user.phoneNumber,
  template: 'sms/order-shipped',
  data: { orderId: order.id },
  locale: 'de'
});

const results = await smsService.sendSmsBulkAndWait(
  customers.map((customer) => ({ to: customer.phoneNumber, text: 'We are open on Sunday.' }))
);
```

The worker sends the queued message with the `SmsSender`, so an error of the driver fails the job with
`SMS_SEND_FAILED` (an error that is not an `SmsError` is wrapped in one naming the driver class). A queue returning a
job without an id fails `sendSmsAndWait` with `SMS_JOB_NOT_FOUND`, though the message may still be sent.

### Templates

A `TemplateSms` is rendered from its `<template>.txt` template with the template engine of `@appweaver/handlebars`,
so it needs the package, and the text is trimmed with its whitespace collapsed into single spaces. A message without
the template fails with `TEMPLATE_NOT_FOUND`, and without a template engine with `CONFIGURATION_INVALID`. The templates
live in `TEMPLATE_PATH` like the email ones, and translate with `{{t "key"}}`:

```hbs
{{! templates/sms/order-shipped.txt.hbs }}
{{t "sms.orderShipped" orderId=orderId}}
```

### Account messages

The 2FA codes and the phone verification codes are sent with `sendSmsAndWait`, so a number the provider rejects fails
the request with `SMS_SEND_FAILED`. Each one renders the template of the application when it exists, otherwise the
`sms.*` translation, which the framework defines in English and `locales/<locale>.json` overrides:

| Template              | Translation         | Data                                  |
|-----------------------|---------------------|---------------------------------------|
| `sms/two-factor-code` | `sms.twoFactorCode` | `code`, `appName`, `expiresInMinutes` |
| `sms/verify-phone`    | `sms.verifyPhone`   | `code`, `appName`, `expiresInMinutes` |

The translations take the minutes as `count`, i.e. `{count, plural, one {# minute} other {# minutes}}`. A project
created with the `sms` and `templates` modules of `@appweaver/create` gets both templates, and their English texts in
`locales/en.json` with the `locales` module.

## Injecting SmsSender

The driver sends a message right away, outside of the queue:

```ts
import { inject } from '@appweaver/core';
import { SmsSender } from '@appweaver/common';

const sender = inject(SmsSender, false);
await sender?.sendSms({ to: '+385911234567', text: 'Hello' });
```

A driver of another provider extends `SmsSender` (`sendSms`, `checkHealth`) and is tested with `testSmsContract` of
`@appweaver/testing`, see [modules](./modules.md#testing-a-driver). The health check of `TwilioSms` reads the status
page of Twilio (`SMS_TWILIO_STATUS_URL`), reporting the sender down during a major or critical outage.

## Configuration

See the [SMS section](./configuration.md#sms-sms_) of the configuration: `SMS_PROVIDER`, `SMS_SENDER` and the
`SMS_TWILIO_*` keys. A test environment selects the `json` provider, which a project created with the `sms` module also
does in the `dev` environment:

```json
{
  "environments": {
    "test": {
      "sms": {
        "provider": "json"
      }
    }
  }
}
```
