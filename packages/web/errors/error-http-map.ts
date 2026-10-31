import {
  applicationErrorMapping,
  ErrorCode,
  ErrorHttpMapping,
  isFrameworkErrorCode
} from '@appweaver/common';

/** The HTTP mapping of every framework error code. */
export const errorHttpMap: { readonly [C in ErrorCode]: ErrorHttpMapping } = {
  [ErrorCode.InternalError]: { status: 500, title: 'Internal server error' },
  [ErrorCode.ValidationFailed]: { status: 400, title: 'Validation failed' },
  [ErrorCode.MalformedRequest]: { status: 400, title: 'Malformed request' },
  [ErrorCode.UnsupportedMediaType]: {
    status: 415,
    title: 'Unsupported media type'
  },
  [ErrorCode.PayloadTooLarge]: { status: 413, title: 'Payload too large' },
  [ErrorCode.RouteNotFound]: { status: 404, title: 'Route not found' },
  [ErrorCode.RateLimited]: { status: 429, title: 'Too many requests' },
  [ErrorCode.RequestFailed]: { status: 400, title: 'Request failed' },

  [ErrorCode.ConfigurationInvalid]: {
    status: 500,
    title: 'Invalid configuration'
  },
  [ErrorCode.ContextDefinitionMissing]: {
    status: 500,
    title: 'Missing context definition'
  },
  [ErrorCode.ContextDefinitionDuplicate]: {
    status: 500,
    title: 'Duplicate context definition'
  },
  [ErrorCode.ContextServerUnavailable]: {
    status: 500,
    title: 'Server unavailable'
  },

  [ErrorCode.ModuleInvalid]: { status: 500, title: 'Invalid module' },
  [ErrorCode.ModuleMissing]: { status: 500, title: 'Missing module' },
  [ErrorCode.ModuleDuplicate]: { status: 500, title: 'Duplicate module' },
  [ErrorCode.ModuleIncompatible]: {
    status: 500,
    title: 'Incompatible module'
  },
  [ErrorCode.ModuleProviderMissing]: {
    status: 500,
    title: 'Missing provider'
  },
  [ErrorCode.ModuleProviderAmbiguous]: {
    status: 500,
    title: 'Ambiguous provider'
  },

  [ErrorCode.DatabaseUniqueViolation]: {
    status: 409,
    title: 'Unique constraint violation'
  },
  [ErrorCode.DatabaseForeignKeyViolation]: {
    status: 409,
    title: 'Relation constraint violation'
  },
  [ErrorCode.DatabaseNullViolation]: {
    status: 400,
    title: 'Required field missing'
  },
  [ErrorCode.DatabaseValueTooLong]: { status: 400, title: 'Value too long' },
  [ErrorCode.DatabaseValueOutOfRange]: {
    status: 400,
    title: 'Value out of range'
  },
  [ErrorCode.DatabaseInvalidValue]: { status: 400, title: 'Invalid value' },
  [ErrorCode.DatabaseRecordNotFound]: {
    status: 404,
    title: 'Record not found'
  },
  [ErrorCode.DatabaseWriteConflict]: { status: 409, title: 'Write conflict' },
  [ErrorCode.DatabaseInvalidTransaction]: {
    status: 500,
    title: 'Invalid transaction'
  },
  [ErrorCode.DatabaseUnavailable]: {
    status: 503,
    title: 'Database unavailable'
  },
  [ErrorCode.DatabaseOperationFailed]: {
    status: 500,
    title: 'Database operation failed'
  },

  [ErrorCode.ResourceNotFound]: { status: 404, title: 'Resource not found' },
  [ErrorCode.ResourceForbidden]: {
    status: 403,
    title: 'Resource access forbidden'
  },
  [ErrorCode.ResourceInvalidSort]: { status: 400, title: 'Invalid sort' },
  [ErrorCode.ResourceInvalidAggregate]: {
    status: 400,
    title: 'Invalid aggregation'
  },
  [ErrorCode.ResourceInvalidCursor]: {
    status: 400,
    title: 'Invalid pagination cursor'
  },
  [ErrorCode.ResourceInvalidQueryParameter]: {
    status: 400,
    title: 'Invalid query parameter'
  },
  [ErrorCode.ResourceInvalidRelation]: {
    status: 400,
    title: 'Invalid relation'
  },
  [ErrorCode.ResourceDeleteRestricted]: {
    status: 409,
    title: 'Delete restricted'
  },

  [ErrorCode.AuthUnauthorized]: { status: 401, title: 'Unauthorized' },
  [ErrorCode.AuthInvalidCredentials]: {
    status: 401,
    title: 'Invalid credentials'
  },
  [ErrorCode.AuthInvalidHeader]: {
    status: 401,
    title: 'Invalid authorization header'
  },
  [ErrorCode.AuthInvalidToken]: { status: 401, title: 'Invalid token' },
  [ErrorCode.AuthTokenExpired]: { status: 401, title: 'Token expired' },
  [ErrorCode.AuthForbidden]: { status: 403, title: 'Forbidden' },
  [ErrorCode.AuthScopeForbidden]: {
    status: 403,
    title: 'Token scope forbidden'
  },
  [ErrorCode.AuthUserNotFound]: {
    status: 400,
    title: 'User not found or disabled'
  },
  [ErrorCode.AuthPasswordDisabled]: {
    status: 403,
    title: 'Password authentication disabled'
  },
  [ErrorCode.AuthPasswordInvalid]: { status: 403, title: 'Invalid password' },
  [ErrorCode.AuthPasswordWeak]: { status: 400, title: 'Password too weak' },
  [ErrorCode.AuthPasswordRequired]: {
    status: 401,
    title: 'Password confirmation required'
  },
  [ErrorCode.AuthApiKeyMissing]: { status: 401, title: 'API key missing' },
  [ErrorCode.AuthApiKeyInvalid]: { status: 401, title: 'Invalid API key' },
  [ErrorCode.AuthApiKeyExpired]: { status: 403, title: 'API key expired' },
  [ErrorCode.AuthProxyAuthenticationRequired]: {
    status: 407,
    title: 'Proxy authentication required'
  },
  [ErrorCode.AuthInvalidRedirectUrl]: {
    status: 400,
    title: 'Invalid redirect URL'
  },

  [ErrorCode.AccountFeatureUnavailable]: {
    status: 501,
    title: 'Account feature unavailable'
  },
  [ErrorCode.AccountEmailAlreadyVerified]: {
    status: 409,
    title: 'Email already verified'
  },
  [ErrorCode.AccountPasswordNotSet]: { status: 403, title: 'Password not set' },

  [ErrorCode.OAuth2ProviderError]: {
    status: 502,
    title: 'OAuth2 provider error'
  },
  [ErrorCode.OAuth2EmailUnavailable]: {
    status: 403,
    title: 'OAuth2 email unavailable'
  },
  [ErrorCode.OAuth2RegistrationDisabled]: {
    status: 403,
    title: 'OAuth2 registration disabled'
  },
  [ErrorCode.OAuth2AccountConflict]: {
    status: 409,
    title: 'OAuth2 account linked to another user'
  },
  [ErrorCode.OAuth2UserRejected]: {
    status: 403,
    title: 'OAuth2 user rejected'
  },

  [ErrorCode.RecaptchaMissing]: { status: 400, title: 'reCAPTCHA missing' },
  [ErrorCode.RecaptchaInvalid]: { status: 400, title: 'Invalid reCAPTCHA' },
  [ErrorCode.RecaptchaActionMismatch]: {
    status: 403,
    title: 'reCAPTCHA action mismatch'
  },
  [ErrorCode.RecaptchaLowScore]: { status: 403, title: 'reCAPTCHA low score' },
  [ErrorCode.RecaptchaUnavailable]: {
    status: 502,
    title: 'reCAPTCHA unavailable'
  },

  [ErrorCode.TurnstileMissing]: { status: 400, title: 'Turnstile missing' },
  [ErrorCode.TurnstileInvalid]: { status: 400, title: 'Invalid Turnstile' },
  [ErrorCode.TurnstileActionMismatch]: {
    status: 403,
    title: 'Turnstile action mismatch'
  },
  [ErrorCode.TurnstileUnavailable]: {
    status: 502,
    title: 'Turnstile unavailable'
  },

  [ErrorCode.FileNotFound]: { status: 404, title: 'File not found' },
  [ErrorCode.FileForbidden]: { status: 403, title: 'File access forbidden' },
  [ErrorCode.FileFieldNotFound]: { status: 400, title: 'File field not found' },
  [ErrorCode.FileUnsupportedType]: {
    status: 415,
    title: 'Unsupported file type'
  },
  [ErrorCode.FileTooLarge]: { status: 413, title: 'File too large' },
  [ErrorCode.FileLimitExceeded]: {
    status: 400,
    title: 'File limit exceeded'
  },
  [ErrorCode.FileInvalidPath]: { status: 400, title: 'Invalid file path' },
  [ErrorCode.FileNoneProvided]: { status: 400, title: 'No files provided' },
  [ErrorCode.FileUploadFailed]: { status: 400, title: 'File upload failed' },
  [ErrorCode.FileDeleteFailed]: { status: 400, title: 'File delete failed' },
  [ErrorCode.FileStorageError]: { status: 500, title: 'File storage error' },

  [ErrorCode.ExportFailed]: { status: 500, title: 'Export failed' },

  [ErrorCode.QueueClosed]: { status: 503, title: 'Queue closed' },
  [ErrorCode.QueueUnavailable]: { status: 503, title: 'Queue unavailable' },

  [ErrorCode.MailerSendFailed]: { status: 502, title: 'Email sending failed' },
  [ErrorCode.MailerJobNotFound]: {
    status: 500,
    title: 'Email job not found'
  },
  [ErrorCode.MailerSenderMissing]: {
    status: 500,
    title: 'Email sender missing'
  },

  [ErrorCode.TemplateNotFound]: { status: 500, title: 'Template not found' },
  [ErrorCode.TemplateRenderFailed]: {
    status: 500,
    title: 'Template rendering failed'
  },
  [ErrorCode.TemplateLoadFailed]: {
    status: 500,
    title: 'Template loading failed'
  },
  [ErrorCode.TemplatePreviewNotFound]: {
    status: 404,
    title: 'Template preview not found'
  },

  [ErrorCode.LocaleLoadFailed]: {
    status: 500,
    title: 'Locale loading failed'
  },

  [ErrorCode.LockNotAcquired]: { status: 503, title: 'Resource is locked' },

  [ErrorCode.MemoryUnavailable]: { status: 503, title: 'Memory unavailable' }
};

/**
 * Returns the HTTP mapping of a framework or application error code, or
 * undefined for a code that is not registered.
 */
export function errorHttpMapping(code: string): ErrorHttpMapping | undefined {
  return isFrameworkErrorCode(code)
    ? errorHttpMap[code]
    : applicationErrorMapping(code);
}
