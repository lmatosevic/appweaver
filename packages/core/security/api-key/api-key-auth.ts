import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { requestContext } from '@fastify/request-context';
import {
  AuthSource,
  AuthType,
  config,
  Database,
  ErrorCode,
  makeHash,
  toResourceId,
  uncapitalize
} from '@appweaver/common';
import { inject, injectModel } from '../../context';
import { liveRecordFilter } from '../../utils';
import { resourceAuthModel } from '../helper';
import { AuthService } from '../auth-service';
import { AuthError } from '../auth-error';
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
      throw new AuthError(
        ErrorCode.AuthApiKeyMissing,
        `Missing API key header: ${config.SECURITY_API_KEY_HEADER_NAME}`,
        { header: config.SECURITY_API_KEY_HEADER_NAME }
      );
    }

    const sanitizedApiKey = String(key).trim();

    // Use configured delimiter to split an API key and separate ID from the
    // rest of the key value
    const apiKeyParts = sanitizedApiKey.split(
      config.SECURITY_API_KEY_DELIMITER
    );
    // The id prefix is read back in the primary key type of the ApiKey model,
    // which can be configured as a string like on any other model
    const apiKeyId = toResourceId(
      apiKeyParts.shift() ?? '',
      injectModel('ApiKey', false)?.config?.id
    );
    const apiKeyValue = apiKeyParts.join(config.SECURITY_API_KEY_DELIMITER);

    const cacheKey = cacheService.buildCacheKey({
      baseKey: `apikey:${apiKeyId}`,
      modelName: 'ApiKey'
    });

    let apiKey = await cacheService.getCachedValue<ApiKey>(cacheKey);
    if (!apiKey) {
      try {
        // The generated client types the id after the configured primary key
        apiKey = await db.client().apiKey.findFirst({
          where: { id: apiKeyId as any, ...liveRecordFilter('ApiKey') }
        });
      } catch (e) {
        throw new AuthError(
          ErrorCode.AuthApiKeyInvalid,
          'Invalid API key format'
        );
      }

      if (apiKey) {
        await cacheService.addToCache(
          cacheKey,
          apiKey,
          config.SECURITY_CACHE_TTL
        );
      }
    }

    // Checked on every request, since the cache is keyed by the id prefix alone
    if (
      !apiKey ||
      !apiKey.enabled ||
      apiKey.keyHash !== makeHash(apiKeyValue)
    ) {
      throw new AuthError(ErrorCode.AuthApiKeyInvalid, 'Invalid API key');
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()) {
      throw new AuthError(ErrorCode.AuthApiKeyExpired, 'API key has expired');
    }

    const authModelField = uncapitalize(resourceAuthModel()!.name);
    const authUser = await authService.findById(apiKey[`${authModelField}Id`]);

    authService.authorize(authUser, request.url, request.routeOptions.config);

    requestContext.set('apiKey', apiKey);
    requestContext.set('authUser', authUser);
    requestContext.set('authType', AuthType.ApiKey);
    requestContext.set('authSource', AuthSource.ApiKey);
  });
});

export function hasApiKey(request: FastifyRequest): boolean {
  return !!request.headers[config.SECURITY_API_KEY_HEADER_NAME.toLowerCase()];
}
