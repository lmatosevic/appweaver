import { Type } from '@sinclair/typebox';
import { RouteSchema } from '@appweaver/common';
import { AllErrorResponses } from '../../errors';

export const OAuth2RedirectQuery = Type.Object({
  redirectToUrl: Type.String({
    format: 'uri',
    description:
      'A URL to redirect to with one-time-token after successful' +
      ' authentication. The client then needs to exchange this token for' +
      ' an JWT access token',
    example: 'https://example.com/login/handler'
  })
});

export const OAuth2CallbackRequest = Type.Object(
  {
    code: Type.String({
      description: 'Authorization code from OAuth2 provider',
      example: '3b7bdc9982feac0e20cf4ddc9be52a1a027142e25b4d14c1b5a280595bc20'
    }),
    state: Type.String({
      description: 'Authorization state returned from OAuth2 provider',
      example: '89bbb34d76801fcf8251193a02a1d62c7c87a'
    }),
    id_token: Type.Optional(
      Type.String({
        description: 'OpenID Connect identity token carrying the user claims'
      })
    ),
    user: Type.Optional(
      Type.String({
        description:
          'JSON encoded user profile, sent by Apple only on the first authorization',
        example: '{"name":{"firstName":"Ada","lastName":"Lovelace"}}'
      })
    )
  },
  { additionalProperties: true }
);

export function createOAuth2RedirectSchema(providerName: string): RouteSchema {
  return {
    tags: ['Auth'],
    summary: `Redirect to ${providerName} authentication page`,
    description: `Redirect to ${providerName} authentication page`,
    querystring: OAuth2RedirectQuery,
    response: {
      302: {
        description: `Redirect to ${providerName} authentication page`
      }
    }
  };
}

/**
 * @param {string} providerName - Human-readable provider name used in the summary and description.
 * @param {boolean} [formPost] - Whether the provider returns the authorization response as a form body
 * (`response_mode=form_post`) instead of query parameters.
 */
export function createOAuth2CallbackSchema(
  providerName: string,
  formPost: boolean = false
): RouteSchema {
  return {
    tags: ['Auth'],
    summary: `Authenticate identity from ${providerName} callback`,
    description: `Authenticate identity from ${providerName} callback`,
    ...(formPost
      ? { body: OAuth2CallbackRequest }
      : { querystring: OAuth2CallbackRequest }),
    response: {
      302: {
        description: `Redirect to 'redirectToUrl' provided when initiating OAuth2 authentication`
      },
      ...AllErrorResponses
    }
  };
}
