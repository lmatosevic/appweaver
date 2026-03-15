import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { config, makeHash } from '@appweaver/common';
import { requestContext } from '@fastify/request-context';
import { inject, injectService } from '../../context';
import { AuthService } from '../auth-service';
import { HttpError } from '../../errors';
import { ApiKey, IResourceService, Server } from '../../types';
import { CacheService } from '../../cache';

export const apiKeyAuth = fastifyPlugin(
  async (server: Server): Promise<void> => {
    const authService = inject(AuthService);
    const cacheService = inject(CacheService);
    const apiKeyService =
      injectService<IResourceService<ApiKey, ApiKey>>('ApiKey');

    server.decorate(
      'authenticateApiKey',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const key =
            request.headers[config.SECURITY_API_KEY_HEADER_NAME.toLowerCase()];
          if (!key) {
            return reply.code(401).send({
              message: `Missing API key header: ${config.SECURITY_API_KEY_HEADER_NAME}`,
              errorCode: 401
            });
          }

          const keyHash = makeHash(String(key).trim());
          const cacheKey = cacheService.buildCacheKey({
            baseKey: `apikey:${keyHash}`,
            modelName: 'ApiKey'
          });

          let apiKey = await cacheService.getCachedValue<ApiKey>(cacheKey);
          if (!apiKey) {
            const keyResult = await apiKeyService.query({ keyHash });
            apiKey = keyResult.items[0];

            if (!apiKey || !apiKey.enabled) {
              return reply.code(401).send({
                message: `Invalid API key`,
                errorCode: 401
              });
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
            return reply.code(401).send({
              message: `API key has expired`,
              errorCode: 403
            });
          }

          const authUser = await authService.findById(apiKey.authId);

          const result = authService.authorize(
            authUser,
            request.url,
            request.routeOptions.config
          );
          if (!result.success) {
            return reply
              .code(result.errorCode)
              .send({ message: result.message, errorCode: result.errorCode });
          }

          requestContext.set('authUser', authUser);
        } catch (e) {
          throw new HttpError('Authentication error', 401, e);
        }
      }
    );
  }
);
