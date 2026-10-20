import fastifyPlugin from 'fastify-plugin';
import { FastifyRequest } from 'fastify';
import {
  ConfigurationError,
  ErrorCode,
  TurnstileError
} from '@appweaver/common';
import { turnstileConfig } from '../security-config';
import { Server } from '../../types/server';
import { turnstileVerify } from './turnstile-verify';

export const turnstile = fastifyPlugin(async (server: Server) => {
  if (!turnstileConfig.SECRET) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      'Turnstile secret is not set'
    );
  }

  server.decorate('turnstile', async (request: FastifyRequest) => {
    const token = request.headers[turnstileConfig.HEADER_NAME.toLowerCase()];
    if (!token) {
      throw new TurnstileError(
        ErrorCode.TurnstileMissing,
        `Missing Turnstile header: ${turnstileConfig.HEADER_NAME}`,
        { header: turnstileConfig.HEADER_NAME }
      );
    }

    await turnstileVerify(
      String(token).trim(),
      request.ip,
      request.routeOptions.config.turnstileAction
    );
  });
});
