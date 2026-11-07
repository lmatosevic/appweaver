import { AuthType } from '@appweaver/common';
import { accountConfig } from '../security-config';
import {
  resetPasswordSchema,
  sendEmailVerificationSchema,
  sendPhoneVerificationSchema,
  sendResetPasswordSchema,
  verifyEmailRedirectSchema,
  verifyEmailSchema,
  verifyPhoneSchema
} from './account-schema';
import { AccountService, VerificationType } from './account-service';
import { inject } from '@appweaver/core';
import { Server } from '../../types/server';

/**
 * Registers the account routes: email and phone verification, and password reset.
 *
 * @param {Server} server - The server to register the routes on.
 */
export function accountRoutes(server: Server): void {
  const { authenticate, currentUser, recaptcha, turnstile } = server;

  // The bot checks enabled in the config, verified on the password reset routes
  const captcha = [recaptcha, turnstile].filter((hook) => hook !== undefined);

  const accountService = inject(AccountService);

  if (accountConfig.VERIFY_EMAIL_ENABLED) {
    server.post(
      '/send-verify-email',
      {
        schema: sendEmailVerificationSchema,
        onRequest: authenticate(),
        config: {
          rateLimit: {
            secure: true,
            max: 10,
            timeWindow: 900000 // 15 minutes
          }
        }
      },
      async (request, reply) => {
        const authUser = currentUser();

        const message = await accountService.sendEmailVerification(
          authUser,
          request.body.redirectToUrl,
          request.body.verificationType as VerificationType
        );

        return reply.send({ message });
      }
    );

    server.post(
      '/verify-email',
      {
        schema: verifyEmailSchema,
        config: {
          rateLimit: {
            max: 12
          }
        }
      },
      async (request, reply) => {
        const message = await accountService.verifyEmailAddress(
          request.body.token
        );

        return reply.send({ message });
      }
    );

    server.get(
      '/verify-email-redirect',
      {
        schema: verifyEmailRedirectSchema,
        config: {
          rateLimit: {
            max: 12
          }
        }
      },
      async (request, reply) => {
        const { redirectUrl, status, message } =
          await accountService.verifyEmailAddressRedirect(request.query.token);

        return reply.redirect(
          `${redirectUrl}status=${status}&message=${message}`
        );
      }
    );
  }

  if (accountConfig.RESET_PASSWORD_ENABLED) {
    server.post(
      '/send-reset-password',
      {
        schema: sendResetPasswordSchema,
        onRequest: captcha,
        config: {
          recaptchaAction: 'send-reset-password',
          turnstileAction: 'send-reset-password',
          rateLimit: {
            secure: true,
            max: 10,
            timeWindow: 900000 // 15 minutes
          }
        }
      },
      async (request, reply) => {
        const message = await accountService.sendResetPassword(
          request.body.email,
          request.body.redirectToUrl
        );

        return reply.send({ message });
      }
    );

    server.post(
      '/reset-password',
      {
        schema: resetPasswordSchema,
        onRequest: captcha,
        config: {
          recaptchaAction: 'reset-password',
          turnstileAction: 'reset-password',
          rateLimit: {
            max: 12
          }
        }
      },
      async (request, reply) => {
        const message = await accountService.resetPassword(
          request.body.token,
          request.body.newPassword
        );

        return reply.send({ message });
      }
    );
  }

  if (accountConfig.VERIFY_PHONE_ENABLED) {
    server.post(
      '/send-verify-phone',
      {
        schema: sendPhoneVerificationSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            secure: true,
            max: 5,
            timeWindow: 900000 // 15 minutes
          }
        }
      },
      async (request, reply) => {
        const response = await accountService.sendPhoneVerification(
          currentUser(),
          request.body.phoneNumber
        );

        return reply.send(response);
      }
    );

    server.post(
      '/verify-phone',
      {
        schema: verifyPhoneSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            secure: true,
            max: 12
          }
        }
      },
      async (request, reply) => {
        const message = await accountService.verifyPhone(
          currentUser(),
          request.body.challengeId,
          request.body.code
        );

        return reply.send({ message });
      }
    );
  }
}
