import { defineModule, Mailer } from '@appweaver/common';
import { smtpConfig } from './config';

/** The SMTP mailer. */
export default defineModule({
  name: '@appweaver/nodemailer',
  config: [smtpConfig],
  providers: [
    {
      contract: Mailer,
      name: 'smtp',
      load: () => import('./smtp-mailer')
    }
  ]
});
