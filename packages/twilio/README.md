<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The Twilio SMS driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/twilio" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/twilio.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/twilio.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/twilio" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/twilio.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/twilio` is the Twilio SMS sender of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled by
installing it, which provides the `twilio` `SmsSender` provider. With `auto`, the default of the `sms.provider` config
key, it is selected whenever the module is installed. It sends the SMS codes of the two-factor authentication and the
phone verification, and any message of `SmsService`, with the Messages resource of the Twilio REST API, without a
dependency on the Twilio SDK.

## Installation

```sh
npm install @appweaver/twilio
```

or `weaver module add sms` in a project created with `@appweaver/create`.

The account is configured in `sms.twilio` (`SMS_TWILIO_ACCOUNT_SID`, `SMS_TWILIO_AUTH_TOKEN`), and the messages are
sent from the `sms.sender` number (`SMS_SENDER`) or the messaging service of `sms.twilio.messagingServiceSid`
(`SMS_TWILIO_MESSAGING_SERVICE_SID`).

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
