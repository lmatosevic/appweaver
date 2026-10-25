import { defineModule, Mailer } from '@appweaver/common';
import { smtpConfig } from './config';

/** The SMTP mailer. */
export default defineModule({
  name: '@appweaver/nodemailer',
  config: [smtpConfig],
  loggers: ['mailer'],
  providers: [
    {
      contract: Mailer,
      name: 'smtp',
      load: () => import('./smtp-mailer')
    }
  ]
});
