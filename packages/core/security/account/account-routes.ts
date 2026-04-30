import { AuthType, config } from '@appweaver/common';
import {
  resetPasswordSchema,
  send2FACodeSchema,
  sendEmailVerificationSchema,
  sendResetPasswordSchema,
  verify2FACodeSchema,
  verifyEmailRedirectSchema,
  verifyEmailSchema
} from './account-schema';
import { AccountService, VerificationType } from './account-service';
import { inject } from '../../context';
import { Server } from '../../types';

export function accountRoutes(server: Server): void {
  const { authenticate, currentUser, recaptcha } = server;

  const accountService = inject(AccountService);

  if (config.SECURITY_ACCOUNT_VERIFY_EMAIL_ENABLED) {
    server.post(
      '/send-verify-email',
      {
        schema: sendEmailVerificationSchema,
        onRequest: authenticate(),
        config: {
          rateLimit: {
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

  if (config.SECURITY_ACCOUNT_RESET_PASSWORD_ENABLED) {
    server.post(
      '/send-reset-password',
      {
        schema: sendResetPasswordSchema,
        onRequest: recaptcha,
        config: {
          rateLimit: {
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
        onRequest: recaptcha,
        config: {
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

  if (config.SECURITY_ACCOUNT_2FA_ENABLED) {
    server.post(
      '/send-2fa-code',
      {
        schema: send2FACodeSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            max: 10,
            timeWindow: 900000 // 15 minutes
          }
        }
      },
      async (request, reply) => {
        const authUser = currentUser();

        const response = await accountService.send2FACode(
          authUser,
          request.body.purpose
        );

        return reply.send(response);
      }
    );

    server.post(
      '/verify-2fa-code',
      {
        schema: verify2FACodeSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            max: 12
          }
        }
      },
      async (request, reply) => {
        const response = await accountService.verify2FACode(
          request.body.challengeId,
          request.body.code
        );

        return reply.send(response);
      }
    );
  }
}
