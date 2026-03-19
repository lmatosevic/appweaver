import fastifyPlugin from 'fastify-plugin';
import { FastifyRequest } from 'fastify';
import { config } from '@appweaver/common';
import { HttpError } from '../../errors';
import { Server } from '../../types';
import { recaptchaVerify } from './recaptcha-verify';

export const recaptcha = fastifyPlugin(
  async (server: Server): Promise<void> => {
    if (!config.SECURITY_RECAPTCHA_SECRET) {
      throw Error('reCAPTCHA secret is not set');
    }

    server.decorate('recaptcha', async (request: FastifyRequest) => {
      const token =
        request.headers[config.SECURITY_RECAPTCHA_HEADER_NAME.toLowerCase()];
      if (!token) {
        throw new HttpError(
          `Missing reCAPTCHA header: ${config.SECURITY_RECAPTCHA_HEADER_NAME}`,
          401
        );
      }

      await recaptchaVerify(
        String(token).trim(),
        request.ip,
        request.routeOptions.config.recaptchaAction
      );
    });
  }
);
