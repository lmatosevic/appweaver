import { Static } from '@sinclair/typebox';
import {
  config,
  ConfigurationError,
  ErrorCode,
  logger,
  TemplateEngine,
  templateContentType,
  TemplateError
} from '@appweaver/common';
import { templatePreviewConfig } from './template-config';
import { inject } from '../context';
import { Server } from '../types';
import {
  TemplatePreviewParams,
  TemplatePreviewQuery,
  templatePreviewSchema
} from './template-preview-schema';
import { PREVIEW_LOCALE_PARAM, previewData } from './utils/preview-data';

/**
 * Registers the route rendering a template by its name, i.e. `/emails/order-confirmation.html`, with the data of the
 * query parameters, see {@link previewData}. The `_locale` parameter selects the locale.
 *
 * @param {Server} server - The server to register the route on.
 * @return {Promise<void>} A promise that resolves once the route is registered.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` if no template engine is loaded.
 */
export async function templatePreview(server: Server): Promise<void> {
  const { authenticate } = server;

  const templateEngine = inject(TemplateEngine, false);
  if (!templateEngine) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      'The template preview requires a template engine, install the handlebars package or disable TEMPLATE_PREVIEW_ENABLED'
    );
  }

  server.get<{
    Params: Static<typeof TemplatePreviewParams>;
    Querystring: Static<typeof TemplatePreviewQuery>;
  }>(
    '/*',
    {
      schema: templatePreviewSchema,
      onRequest: templatePreviewConfig.AUTH ? authenticate() : undefined,
      config: {
        rateLimit: {
          max: 60
        }
      }
    },
    async (request, reply) => {
      const name = request.params['*'];
      const { [PREVIEW_LOCALE_PARAM]: locale, ...query } = request.query;

      if (!(await templateEngine.hasTemplate(name, locale))) {
        throw new TemplateError(
          ErrorCode.TemplatePreviewNotFound,
          `Template '${name}' not found`,
          { template: name, locale }
        );
      }

      const content = await templateEngine.render(name, previewData(query), {
        locale
      });

      // The sandbox keeps the scripts of a rendered page from running
      return reply
        .header('Content-Type', templateContentType(name))
        .header('Content-Security-Policy', 'sandbox')
        .header('Cache-Control', 'no-store')
        .send(content);
    }
  );

  logger.info(
    `Template preview enabled on '${server.prefix}/*'${templatePreviewConfig.AUTH ? ', requiring authentication' : ''}`
  );
}
