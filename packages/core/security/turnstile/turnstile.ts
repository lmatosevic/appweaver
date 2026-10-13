import fastifyPlugin from 'fastify-plugin';
import { FastifyRequest } from 'fastify';
import { config, ConfigurationError, ErrorCode } from '@appweaver/common';
import { TurnstileError } from './turnstile-error';
import { Server } from '../../types';
import { turnstileVerify } from './turnstile-verify';

export const turnstile = fastifyPlugin(async (server: Server) => {
  if (!config.SECURITY_TURNSTILE_SECRET) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      'Turnstile secret is not set'
    );
  }

  server.decorate('turnstile', async (request: FastifyRequest) => {
    const token =
      request.headers[config.SECURITY_TURNSTILE_HEADER_NAME.toLowerCase()];
    if (!token) {
      throw new TurnstileError(
        ErrorCode.TurnstileMissing,
        `Missing Turnstile header: ${config.SECURITY_TURNSTILE_HEADER_NAME}`,
        { header: config.SECURITY_TURNSTILE_HEADER_NAME }
      );
    }

    await turnstileVerify(
      String(token).trim(),
      request.ip,
      request.routeOptions.config.turnstileAction
    );
  });
});
