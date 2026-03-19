import fastifyPlugin from 'fastify-plugin';
import fastifyBasicAuth from '@fastify/basic-auth';
import { requestContext } from '@fastify/request-context';
import { config } from '@appweaver/common';
import { inject } from '../../context';
import { AuthService } from '../auth-service';
import { Server } from '../../types';

export const basicAuth = fastifyPlugin(
  async (server: Server): Promise<void> => {
    const authService = inject(AuthService);

    server.register(fastifyBasicAuth, {
      authenticate: config.SECURITY_BASIC_REALM
        ? { realm: config.SECURITY_BASIC_REALM }
        : true,
      proxyMode: config.SECURITY_BASIC_PROXY_MODE,
      validate: async (username, password, request) => {
        const authUser = await authService.authenticate(username, password);

        authService.authorize(
          authUser,
          request.url,
          request.routeOptions.config
        );

        requestContext.set('authUser', authUser);
      }
    });
  }
);
