import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { errorResponses, injectService, registerRoute } from '@appweaver/core';
import db from '@db/client';
import { Role } from '@/features/access/roles';

// Customers open their own accounts, signing in afterwards through /auth/login
registerRoute(
  (router) => {
    router.post(
      '/register',
      {
        schema: {
          tags: ['Account'],
          summary: 'Open a customer account',
          body: Type.Object({
            firstName: Type.String({ minLength: 1, maxLength: 100 }),
            lastName: Type.String({ minLength: 1, maxLength: 100 }),
            email: Type.String({ format: 'email', maxLength: 255 }),
            password: Type.String({ minLength: 8, maxLength: 100 }),
            marketingOptIn: Type.Optional(Type.Boolean())
          }),
          response: {
            201: Type.Ref('UserSingle'),
            ...errorResponses(ErrorCode.DatabaseUniqueViolation)
          }
        }
      },
      async (req, reply) => {
        const customer = await db.role.findUniqueOrThrow({
          where: { name: Role.Customer }
        });

        // A taken email fails the unique constraint of the field, answered
        // with a DATABASE_UNIQUE_VIOLATION naming it
        const user = await injectService('User').create({
          ...req.body,
          marketingOptIn: req.body.marketingOptIn ?? false,
          twoFactorAuth: 'None',
          enabled: true,
          roles: [{ id: customer.id }]
        });

        return reply.status(201).send(user);
      }
    );
  },
  {
    public: true,
    // Checked only when reCAPTCHA is enabled in the configuration
    recaptcha: true,
    recaptchaAction: 'register',
    rateLimit: { max: 5, timeWindow: '10 minutes' }
  }
);
