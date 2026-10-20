import { Type } from '@sinclair/typebox';
import { ErrorCode, RouteSchema } from '@appweaver/common';
import { errorResponses } from '../errors/error-schema';
import { PREVIEW_DATA_PARAM, PREVIEW_LOCALE_PARAM } from './utils/preview-data';

export const TemplatePreviewParams = Type.Object({
  '*': Type.String()
});

export const TemplatePreviewQuery = Type.Object(
  {
    [PREVIEW_LOCALE_PARAM]: Type.Optional(Type.String({ example: 'de' })),
    [PREVIEW_DATA_PARAM]: Type.Optional(
      Type.String({ example: '{"user":{"name":"Ana"}}' })
    )
  },
  { additionalProperties: true }
);

/** The route schema of the template preview, left out of the OpenAPI document as a development tool. */
export const templatePreviewSchema: RouteSchema & { hide: boolean } = {
  hide: true,
  tags: ['Templates'],
  summary: 'Preview a template',
  description:
    'Renders a template with the data of the query parameters, in the locale of the `_locale` parameter',
  params: TemplatePreviewParams,
  querystring: TemplatePreviewQuery,
  response: {
    ...errorResponses(
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthTokenExpired,
      ErrorCode.MalformedRequest,
      ErrorCode.TemplatePreviewNotFound,
      ErrorCode.TemplateRenderFailed
    )
  }
};
