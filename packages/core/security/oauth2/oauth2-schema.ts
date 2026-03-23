import { Type } from '@sinclair/typebox';
import { AllErrorResponses } from '../../errors';
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

export const OAuth2CallbackQuery = Type.Object({
  code: Type.String({
    description: 'Authorization code from OAuth2 provider',
    examples: ['3b7bdc9982feac0e20cf4ddc9be52a1a027142e25b4d14c1b5a280595bc20']
  }),
  state: Type.String({
    description: 'Authorization state returned from OAuth2 provider',
    examples: ['89bbb34d76801fcf8251193a02a1d62c7c87a']
  })
});

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
      302: {
        description: `Redirect to 'redirectToUrl' provided when initiating OAuth2 authentication`
      },
      ...AllErrorResponses
    }
  };
}
