import { Type } from '@sinclair/typebox';
import { AllErrorResponses } from '../../errors';
import { AuthTokensResponse } from '../auth-schema';
import { RouteSchema } from '../../types';

export const OAuth2RedirectQuery = Type.Object({
  redirectToUrl: Type.String({
    format: 'uri',
    description:
      'A URL to redirect to with one-time-token after successful' +
      ' authentication. The client then needs to exchange this token for' +
      ' an JWT access token',
    examples: ['https://example.com/login/handler']
  })
});

export const OAuth2CallbackQuery = Type.Object(
  {
    returnAuthTokens: Type.Optional(
      Type.Boolean({
        description:
          'A flag indicating if this endpoint should return authentication tokens' +
          ' directly, instead of redirecting request to the provided endpoint',
        examples: [true]
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

export function createOAuth2CallbackSchema(providerName: string): RouteSchema {
  return {
    tags: ['Auth'],
    summary: `Authenticate identity from ${providerName} callback`,
    description: `Authenticate identity from ${providerName} callback`,
    querystring: OAuth2CallbackQuery,
    response: {
      200: AuthTokensResponse,
      302: {
        description: `Redirect to 'redirectToUrl' provided when initiating OAuth2 authentication`
      },
      ...AllErrorResponses
    }
  };
}
