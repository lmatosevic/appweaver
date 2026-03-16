import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { requestContext } from '@fastify/request-context';
import { config, Database, makeHash, uncapitalize } from '@appweaver/common';
import { inject } from '../../context';
import { resourceAuthModel } from '../helper';
import { AuthService } from '../auth-service';
import { HttpError } from '../../errors';
import { CacheService } from '../../cache';
import { PrismaDatabase } from '../../database';
import { ApiKey, Server } from '../../types';

export const apiKeyAuth = fastifyPlugin(
  async (server: Server): Promise<void> => {
    const authService = inject(AuthService);
    const cacheService = inject(CacheService);
    const db = inject<PrismaDatabase>(Database as any);

    server.decorate('authenticateApiKey', async (request: FastifyRequest) => {
      const key =
        request.headers[config.SECURITY_API_KEY_HEADER_NAME.toLowerCase()];
      if (!key) {
        throw new HttpError(
          `Missing API key header: ${config.SECURITY_API_KEY_HEADER_NAME}`,
          401
        );
      }

      const keyHash = makeHash(String(key).trim());
      const cacheKey = cacheService.buildCacheKey({
        baseKey: `apikey:${keyHash}`,
        modelName: 'ApiKey'
      });

      let apiKey = await cacheService.getCachedValue<ApiKey>(cacheKey);
      if (!apiKey) {
        apiKey = await db.client().apiKey.findFirst({ where: { keyHash } });

        if (!apiKey || !apiKey.enabled) {
          throw new HttpError(`Invalid API key`, 401);
        }

        await cacheService.addToCache(
          cacheKey,
          apiKey,
          config.SECURITY_CACHE_TTL
        );
      }

      if (
        apiKey.expiresAt &&
        new Date(apiKey.expiresAt).getTime() < Date.now()
      ) {
        throw new HttpError(`API key has expired`, 403);
      }

      const authModelField = uncapitalize(resourceAuthModel()!.name);
      const authUser = await authService.findById(
        apiKey[`${authModelField}Id`]
      );

      const result = authService.authorize(
        authUser,
        request.url,
        request.routeOptions.config
      );

      if (!result.success) {
        throw new HttpError(result.message, result.errorCode);
      }

      requestContext.set('apiKey', apiKey);
      requestContext.set('authUser', authUser);
    });
  }
);
