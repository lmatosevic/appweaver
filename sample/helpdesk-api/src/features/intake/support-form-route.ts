import { Type } from '@sinclair/typebox';
import { injectService, registerRoute } from '@appweaver/core';

registerRoute(
  (router) => {
    router.post(
      '/support/tickets',
      {
        schema: {
          tags: ['Support form'],
          summary: 'Open a ticket from the public support form',
          description:
            'Needs no account. The customer is matched by email, and only the reference is returned.',
          body: Type.Object({
            name: Type.String({ minLength: 1, maxLength: 150 }),
            email: Type.String({ format: 'email', maxLength: 255 }),
            subject: Type.String({ minLength: 3, maxLength: 200 }),
            description: Type.String({ minLength: 10, maxLength: 20000 })
          }),
          response: {
            201: Type.Object({
              reference: Type.String({ example: 'HD-7K2Q9X' }),
              status: Type.String({ example: 'New' })
            })
          }
        }
      },
      async (req, reply) => {
        const { name, email, subject, description } = req.body;

        // A customer never picks the priority or the team, triage does
        const ticket = await injectService('Ticket').create({
          subject,
          description,
          channel: 'Web',
          priority: 'Normal',
          customer: { email, name }
        });

        return reply
          .status(201)
          .send({ reference: ticket.reference, status: ticket.status });
      }
    );
  },
  {
    public: true,
    // Checked only when reCAPTCHA is enabled in the configuration
    recaptcha: true,
    recaptchaAction: 'support_form',
    rateLimit: { max: 5, timeWindow: '10 minutes' }
  }
);
