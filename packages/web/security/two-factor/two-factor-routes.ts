import {
  AuthType,
  TwoFactorChallengeMethod,
  TwoFactorMethodType
} from '@appweaver/common';
import { currentAuthSource, inject } from '@appweaver/core';
import { Server } from '../../types/server';
import { TwoFactorService } from './two-factor-service';
import {
  twoFactorChallengeSchema,
  twoFactorDisableMethodSchema,
  twoFactorEnableMethodSchema,
  twoFactorMethodsSchema,
  twoFactorOrderMethodsSchema,
  twoFactorRecoveryCodesSchema,
  twoFactorTotpConfirmSchema,
  twoFactorTotpSetupSchema,
  twoFactorVerifySchema
} from './two-factor-schema';

/**
 * Registers the two-factor authentication routes: the challenge and its verification of the `2fa` scope, and the
 * management of the methods and the recovery codes of the signed-in user.
 *
 * @param {Server} server - The server to register the routes on.
 */
export function twoFactorRoutes(server: Server): void {
  const { authenticate, currentUser } = server;

  const twoFactorService = inject(TwoFactorService);

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
