import fastifyPlugin from 'fastify-plugin';
import { FastifyRequest } from 'fastify';
import {
  ConfigurationError,
  ErrorCode,
  RecaptchaError
} from '@appweaver/common';
import { recaptchaConfig } from '../security-config';
import { Server } from '../../types/server';
import { recaptchaVerify } from './recaptcha-verify';

export const recaptcha = fastifyPlugin(async (server: Server) => {
  if (!recaptchaConfig.SECRET) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      'reCAPTCHA secret is not set'
    );
  }

  server.decorate('recaptcha', async (request: FastifyRequest) => {
    const token = request.headers[recaptchaConfig.HEADER_NAME.toLowerCase()];
    if (!token) {
      throw new RecaptchaError(
        ErrorCode.RecaptchaMissing,
        `Missing reCAPTCHA header: ${recaptchaConfig.HEADER_NAME}`,
        { header: recaptchaConfig.HEADER_NAME }
      );
    }

    await recaptchaVerify(
      String(token).trim(),
      request.ip,
      request.routeOptions.config.recaptchaAction
    );
  });
});
