import { defineModule, Mailer } from '@appweaver/common';

/** The SMTP mailer. */
export default defineModule({
  name: '@appweaver/nodemailer',
  providers: [
    {
      contract: Mailer,
      name: 'smtp',
      load: () => import('../mailer/smtp-mailer')
    }
  ]
});
