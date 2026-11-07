import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const smsConfig = defineConfig('sms', {
  /** Default sender of the text messages, a phone number in the E.164 format or an alphanumeric sender ID, i.e.
   * `Appweaver`. Twilio sends without one from its `sms.twilio.messagingServiceSid`. */
  SENDER: Type.Optional(Type.String()),
  /** SMS provider: `auto` (`twilio` when its module is enabled, otherwise none), `twilio`, `json` (writes the
   * messages into the log, for development and tests), `none`, or the module path of an implementation. Default:
   * `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
