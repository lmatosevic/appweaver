import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const twilioConfig = defineConfig('sms.twilio', {
  /** Twilio account SID, i.e. `ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`. */
  ACCOUNT_SID: Type.Optional(Type.String()),
  /** Twilio auth token of the account. */
  AUTH_TOKEN: Type.Optional(Type.String({ secret: true })),
  /** SID of the Twilio messaging service sending the messages, i.e. `MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`, needed when
   * no `sms.sender` number is configured. */
  MESSAGING_SERVICE_SID: Type.Optional(Type.String()),
  /** Base URL of the Twilio REST API. Default: `'https://api.twilio.com'`. */
  API_URL: Type.String({ default: 'https://api.twilio.com' }),
  /** URL of the status of the Twilio platform, read by the health check. Default:
   * `'https://status.twilio.com/api/v2/status.json'`. */
  STATUS_URL: Type.String({
    default: 'https://status.twilio.com/api/v2/status.json'
  }),
  /** Timeout of a request to the Twilio API in milliseconds. Default: `10000`. */
  TIMEOUT: Type.Integer({ default: 10000 })
});
