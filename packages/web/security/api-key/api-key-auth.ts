import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import {
  AuthSource,
  AuthType,
  Database,
  ErrorCode,
  makeHash,
  toResourceId,
  uncapitalize,
  AuthError
} from '@appweaver/common';
import { securityConfig } from '../security-config';
import {
  apiKeyConfig,
  liveRecordFilter,
  resourceAuthModel,
  PrismaDatabase,
  ApiKey
} from '@appweaver/data';
import {
  inject,
  injectModel,
  CacheService,
  setAuthContext
} from '@appweaver/core';
import { AuthService } from '../auth-service';
import { Server } from '../../types/server';

export const apiKeyAuth = fastifyPlugin(async (server: Server) => {
  const authService = inject(AuthService);
  const cacheService = inject(CacheService);
  const db = inject<PrismaDatabase>(Database as any);

  server.decorate('authenticateApiKey', async (request: FastifyRequest) => {
    const key = request.headers[apiKeyConfig.HEADER_NAME.toLowerCase()];
    if (!key) {
      throw new AuthError(
        ErrorCode.AuthApiKeyMissing,
        `Missing API key header: ${apiKeyConfig.HEADER_NAME}`,
        { header: apiKeyConfig.HEADER_NAME }
      );
    }

    const sanitizedApiKey = String(key).trim();

    // Use configured delimiter to split an API key and separate ID from the
    // rest of the key value
    const apiKeyParts = sanitizedApiKey.split(apiKeyConfig.DELIMITER);
    // The id prefix is read back in the primary key type of the ApiKey model,
    // which can be configured as a string like on any other model
    const apiKeyId = toResourceId(
      apiKeyParts.shift() ?? '',
      injectModel('ApiKey', false)?.config?.id
    );
    const apiKeyValue = apiKeyParts.join(apiKeyConfig.DELIMITER);

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
          securityConfig.CACHE_TTL
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

    setAuthContext({
      apiKey,
      authUser,
      authType: AuthType.ApiKey,
      authSource: AuthSource.ApiKey
    });
  });
});

/** Checks whether a request carries an API key in its configured header. */
export function hasApiKey(request: FastifyRequest): boolean {
  return !!request.headers[apiKeyConfig.HEADER_NAME.toLowerCase()];
}
