import { defineModule, SmsSender } from '@appweaver/common';
import { twilioConfig } from './config';

/** The Twilio SMS sender. */
export default defineModule({
  name: '@appweaver/twilio',
  config: [twilioConfig],
  loggers: ['sms'],
  providers: [
    {
      contract: SmsSender,
      name: 'twilio',
      load: () => import('./twilio-sms')
    }
  ]
});
