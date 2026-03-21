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

export const apiKeyAuth = fastifyPlugin(async (server: Server) => {
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

    const sanitizedApiKey = String(key).trim();

    // Use configured delimiter to split an API key and separate ID from the
    // rest of the key value
    const apiKeyParts = sanitizedApiKey.split(
      config.SECURITY_API_KEY_DELIMITER
    );
    const apiKeyId = parseInt(apiKeyParts.shift() ?? '', 10);
    const apiKeyValue = apiKeyParts.join(config.SECURITY_API_KEY_DELIMITER);

    const cacheKey = cacheService.buildCacheKey({
      baseKey: `apikey:${apiKeyId}`,
      modelName: 'ApiKey'
    });

    let apiKey = await cacheService.getCachedValue<ApiKey>(cacheKey);
    if (!apiKey) {
      try {
        apiKey = await db
          .client()
          .apiKey.findFirst({ where: { id: apiKeyId } });
      } catch (e) {
        throw new HttpError(`Invalid API key format`, 401);
      }

      if (
        !apiKey ||
        !apiKey.enabled ||
        apiKey.keyHash !== makeHash(apiKeyValue)
      ) {
        throw new HttpError(`Invalid API key`, 401);
      }

      await cacheService.addToCache(
        cacheKey,
        apiKey,
        config.SECURITY_CACHE_TTL
      );
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()) {
      throw new HttpError(`API key has expired`, 403);
    }

    const authModelField = uncapitalize(resourceAuthModel()!.name);
    const authUser = await authService.findById(apiKey[`${authModelField}Id`]);

    authService.authorize(authUser, request.url, request.routeOptions.config);

    requestContext.set('apiKey', apiKey);
    requestContext.set('authUser', authUser);
  });
});

export function hasApiKey(request: FastifyRequest): boolean {
  return !!request.headers[config.SECURITY_API_KEY_HEADER_NAME.toLowerCase()];
}
