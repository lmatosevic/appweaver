export enum AuthType {
  Jwt = 'jwt',
  ApiKey = 'apiKey',
  Basic = 'basic'
}

export enum AuthSource {
  Password = 'password',
  ApiKey = 'apiKey',
  OAuth2Custom = 'oauth2Custom',
  OAuth2Google = 'oauth2Google',
  OAuth2Facebook = 'oauth2Facebook',
  OAuth2X = 'oauth2X',
  OAuth2Github = 'oauth2Github',
  OAuth2Gitlab = 'oauth2Gitlab',
  OAuth2Linkedin = 'oauth2Linkedin',
  OAuth2Apple = 'oauth2Apple',
  OAuth2Microsoft = 'oauth2Microsoft'
}

export enum AuthOTTPurpose {
  Authentication = 'authentication',
  OAuth2State = 'oauth2state',
  TwoFAVerification = '2faVerification',
  EmailVerification = 'emailVerification',
  PasswordReset = 'passwordReset'
}

export enum AuthScope {
  Auth = 'auth',
  TwoFA = '2fa',
  Refresh = 'refresh'
}
