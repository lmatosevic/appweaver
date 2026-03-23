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
  OAuth2Facebook = 'oauth2Facebook'
}

export enum AuthOTTPurpose {
  Authentication = 'authentication',
  TwoFAVerification = '2fa-verification',
  EmailVerification = 'email-verification',
  PasswordReset = 'password-reset'
}

export enum AuthScope {
  Auth = 'auth',
  TwoFA = '2fa',
  Refresh = 'refresh'
}
