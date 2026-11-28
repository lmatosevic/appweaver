import {
  AuthType,
  ConfigurationError,
  ErrorCode,
  ResourceId,
  toResourceId,
  TwoFactorChallengeMethod,
  TwoFactorMethodType
} from '@appweaver/common';
import { resourceAuthModel } from '@appweaver/data';
import { currentAuthSource, inject } from '@appweaver/core';
import { Server } from '../../types/server';
import { recoveryCodesConfig, twoFactorConfig } from '../security-config';
import { TwoFactorService } from './two-factor-service';
import {
  twoFactorChallengeSchema,
  twoFactorDisableMethodSchema,
  twoFactorEnableMethodSchema,
  twoFactorMethodsSchema,
  twoFactorOrderMethodsSchema,
  twoFactorRecoveryCodesSchema,
  twoFactorResetSchema,
  twoFactorTotpConfirmSchema,
  twoFactorTotpSetupSchema,
  twoFactorVerifySchema
} from './two-factor-schema';

/**
 * Registers the two-factor authentication routes: the challenge and its verification of the `2fa` scope, and the
 * management of the methods and the recovery codes of the signed-in user. The TOTP setup is registered only with the
 * `Totp` method available, and the recovery codes only with their config enabled.
 *
 * @param {Server} server - The server to register the routes on.
 */
export async function twoFactorRoutes(server: Server): Promise<void> {
  const { authenticate, currentUser } = server;

  const twoFactorService = inject(TwoFactorService);
  assertForcedMethod(twoFactorService);

  server.post(
    '/challenge',
    {
      schema: twoFactorChallengeSchema,
      onRequest: authenticate([AuthType.Jwt]),
      config: {
        rateLimit: {
          secure: true,
          max: 10,
          timeWindow: 900000 // 15 minutes
        }
      }
    },
    async (request, reply) => {
      const response = await twoFactorService.sendChallenge(currentUser(), {
        method: request.body.method as TwoFactorChallengeMethod | undefined,
        purpose: request.body.purpose,
        authSource: currentAuthSource() ?? undefined
      });

      return reply.send(response);
    }
  );

  server.post(
    '/verify',
    {
      schema: twoFactorVerifySchema,
      onRequest: authenticate([AuthType.Jwt]),
      config: {
        rateLimit: {
          secure: true,
          max: 12
        }
      }
    },
    async (request, reply) => {
      const response = await twoFactorService.verifyChallenge(
        currentUser(),
        request.body.challengeId,
        request.body.code
      );

      return reply.send(response);
    }
  );

  server.get(
    '/methods',
    {
      schema: twoFactorMethodsSchema,
      onRequest: authenticate([AuthType.Jwt])
    },
    async (_, reply) => {
      return reply.send(twoFactorService.listMethods(currentUser()));
    }
  );

  server.post(
    '/methods',
    {
      schema: twoFactorEnableMethodSchema,
      onRequest: authenticate([AuthType.Jwt])
    },
    async (request, reply) => {
      const authUser = currentUser();
      const enabled = await twoFactorService.enableMethod(
        authUser,
        request.body.method as TwoFactorMethodType
      );

      return reply.send({
        enabled,
        available: twoFactorService.availableMethods()
      });
    }
  );

  server.put(
    '/methods/order',
    {
      schema: twoFactorOrderMethodsSchema,
      onRequest: authenticate([AuthType.Jwt])
    },
    async (request, reply) => {
      const enabled = await twoFactorService.orderMethods(
        currentUser(),
        request.body.methods as TwoFactorMethodType[]
      );

      return reply.send({
        enabled,
        available: twoFactorService.availableMethods()
      });
    }
  );

  server.delete(
    '/methods/:method',
    {
      schema: twoFactorDisableMethodSchema,
      onRequest: authenticate([AuthType.Jwt]),
      config: {
        rateLimit: {
          secure: true,
          max: 12
        }
      }
    },
    async (request, reply) => {
      const enabled = await twoFactorService.disableMethod(
        currentUser(),
        request.params.method as TwoFactorMethodType,
        request.body?.password
      );

      return reply.send({
        enabled,
        available: twoFactorService.availableMethods()
      });
    }
  );

  // The authenticator app needs the key encrypting its secret, the recovery codes their config
  if (twoFactorService.availableMethods().includes(TwoFactorMethodType.Totp)) {
    server.post(
      '/totp/setup',
      {
        schema: twoFactorTotpSetupSchema,
        onRequest: authenticate([AuthType.Jwt])
      },
      async (_, reply) => {
        return reply.send(await twoFactorService.setupTotp(currentUser()));
      }
    );

    server.post(
      '/totp/confirm',
      {
        schema: twoFactorTotpConfirmSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            secure: true,
            max: 12
          }
        }
      },
      async (request, reply) => {
        const enabled = await twoFactorService.confirmTotp(
          currentUser(),
          request.body.code
        );

        return reply.send({
          enabled,
          available: twoFactorService.availableMethods()
        });
      }
    );
  }

  // An administrator resets the 2FA of a user who lost every method
  server.delete(
    '/users/:id',
    {
      schema: twoFactorResetSchema,
      onRequest: authenticate([AuthType.Jwt]),
      config: { roles: twoFactorConfig.RESET_ROLES }
    },
    async (request, reply) => {
      await twoFactorService.resetTwoFactor(
        toResourceId(request.params.id, resourceAuthModel()?.config.id)
      );
      return reply.code(204).send(null);
    }
  );

  if (recoveryCodesConfig.ENABLED) {
    server.post(
      '/recovery-codes',
      {
        schema: twoFactorRecoveryCodesSchema,
        onRequest: authenticate([AuthType.Jwt]),
        config: {
          rateLimit: {
            secure: true,
            max: 12
          }
        }
      },
      async (request, reply) => {
        return reply.send(
          await twoFactorService.generateRecoveryCodes(
            currentUser(),
            request.body?.password
          )
        );
      }
    );
  }
}

/**
 * Fails the startup when 2FA is forced with a `defaultMethod` the application cannot send, so no user is challenged
 * with a code that never comes.
 *
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` naming the method and its missing service.
 */
function assertForcedMethod(service: TwoFactorService): void {
  const method = twoFactorConfig.DEFAULT_METHOD;
  if (
    !twoFactorConfig.FORCED ||
    method === TwoFactorMethodType.Totp ||
    service.availableMethods().includes(method)
  ) {
    return;
  }
  const missing =
    method === TwoFactorMethodType.Email ? 'a mailer' : 'an SMS sender';
  throw new ConfigurationError(
    ErrorCode.ConfigurationInvalid,
    `2FA is forced with the default method ${method}, which needs ${missing} and security.account.2fa.methods ` +
      `listing it`
  );
}
