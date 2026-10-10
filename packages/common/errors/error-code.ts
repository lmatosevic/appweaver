/**
 * Every error the framework raises, identified by a stable string. The API
 * returns it as the `code` of a problem details response, so the clients can
 * tell the cases apart without parsing the messages.
 *
 * A value starts with the prefix of the module raising it, i.e. `RESOURCE_`,
 * which the module error classes narrow their accepted codes by.
 */
export enum ErrorCode {
  // Request
  InternalError = 'INTERNAL_ERROR',
  ValidationFailed = 'VALIDATION_FAILED',
  MalformedRequest = 'MALFORMED_REQUEST',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  RouteNotFound = 'ROUTE_NOT_FOUND',
  RateLimited = 'RATE_LIMITED',
  RequestFailed = 'REQUEST_FAILED',

  // Configuration and application context
  ConfigurationInvalid = 'CONFIGURATION_INVALID',
  ContextDefinitionMissing = 'CONTEXT_DEFINITION_MISSING',
  ContextDefinitionDuplicate = 'CONTEXT_DEFINITION_DUPLICATE',
  ContextServerUnavailable = 'CONTEXT_SERVER_UNAVAILABLE',

  // Database
  DatabaseUniqueViolation = 'DATABASE_UNIQUE_VIOLATION',
  DatabaseForeignKeyViolation = 'DATABASE_FOREIGN_KEY_VIOLATION',
  DatabaseNullViolation = 'DATABASE_NULL_VIOLATION',
  DatabaseValueTooLong = 'DATABASE_VALUE_TOO_LONG',
  DatabaseValueOutOfRange = 'DATABASE_VALUE_OUT_OF_RANGE',
  DatabaseInvalidValue = 'DATABASE_INVALID_VALUE',
  DatabaseRecordNotFound = 'DATABASE_RECORD_NOT_FOUND',
  DatabaseWriteConflict = 'DATABASE_WRITE_CONFLICT',
  DatabaseInvalidTransaction = 'DATABASE_INVALID_TRANSACTION',
  DatabaseUnavailable = 'DATABASE_UNAVAILABLE',
  DatabaseOperationFailed = 'DATABASE_OPERATION_FAILED',

  // Resource
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  ResourceForbidden = 'RESOURCE_FORBIDDEN',
  ResourceInvalidSort = 'RESOURCE_INVALID_SORT',
  ResourceInvalidAggregate = 'RESOURCE_INVALID_AGGREGATE',
  ResourceInvalidCursor = 'RESOURCE_INVALID_CURSOR',
  ResourceInvalidQueryParameter = 'RESOURCE_INVALID_QUERY_PARAMETER',
  ResourceInvalidRelation = 'RESOURCE_INVALID_RELATION',
  ResourceDeleteRestricted = 'RESOURCE_DELETE_RESTRICTED',

  // Authentication and authorization
  AuthUnauthorized = 'AUTH_UNAUTHORIZED',
  AuthInvalidCredentials = 'AUTH_INVALID_CREDENTIALS',
  AuthInvalidHeader = 'AUTH_INVALID_HEADER',
  AuthInvalidToken = 'AUTH_INVALID_TOKEN',
  AuthTokenExpired = 'AUTH_TOKEN_EXPIRED',
  AuthForbidden = 'AUTH_FORBIDDEN',
  AuthScopeForbidden = 'AUTH_SCOPE_FORBIDDEN',
  AuthUserNotFound = 'AUTH_USER_NOT_FOUND',
  AuthPasswordDisabled = 'AUTH_PASSWORD_DISABLED',
  AuthPasswordInvalid = 'AUTH_PASSWORD_INVALID',
  AuthPasswordWeak = 'AUTH_PASSWORD_WEAK',
  AuthPasswordRequired = 'AUTH_PASSWORD_REQUIRED',
  AuthApiKeyMissing = 'AUTH_API_KEY_MISSING',
  AuthApiKeyInvalid = 'AUTH_API_KEY_INVALID',
  AuthApiKeyExpired = 'AUTH_API_KEY_EXPIRED',
  AuthProxyAuthenticationRequired = 'AUTH_PROXY_AUTHENTICATION_REQUIRED',
  AuthInvalidRedirectUrl = 'AUTH_INVALID_REDIRECT_URL',

  // Account
  AccountFeatureUnavailable = 'ACCOUNT_FEATURE_UNAVAILABLE',
  AccountEmailAlreadyVerified = 'ACCOUNT_EMAIL_ALREADY_VERIFIED',
  AccountPasswordNotSet = 'ACCOUNT_PASSWORD_NOT_SET',

  // OAuth2
  OAuth2ProviderError = 'OAUTH2_PROVIDER_ERROR',
  OAuth2EmailUnavailable = 'OAUTH2_EMAIL_UNAVAILABLE',
  OAuth2RegistrationDisabled = 'OAUTH2_REGISTRATION_DISABLED',
  OAuth2AccountConflict = 'OAUTH2_ACCOUNT_CONFLICT',
  OAuth2UserRejected = 'OAUTH2_USER_REJECTED',

  // reCAPTCHA
  RecaptchaMissing = 'RECAPTCHA_MISSING',
  RecaptchaInvalid = 'RECAPTCHA_INVALID',
  RecaptchaActionMismatch = 'RECAPTCHA_ACTION_MISMATCH',
  RecaptchaLowScore = 'RECAPTCHA_LOW_SCORE',
  RecaptchaUnavailable = 'RECAPTCHA_UNAVAILABLE',

  // File storage
  FileNotFound = 'FILE_NOT_FOUND',
  FileForbidden = 'FILE_FORBIDDEN',
  FileFieldNotFound = 'FILE_FIELD_NOT_FOUND',
  FileUnsupportedType = 'FILE_UNSUPPORTED_TYPE',
  FileTooLarge = 'FILE_TOO_LARGE',
  FileLimitExceeded = 'FILE_LIMIT_EXCEEDED',
  FileInvalidPath = 'FILE_INVALID_PATH',
  FileNoneProvided = 'FILE_NONE_PROVIDED',
  FileUploadFailed = 'FILE_UPLOAD_FAILED',
  FileDeleteFailed = 'FILE_DELETE_FAILED',
  FileStorageError = 'FILE_STORAGE_ERROR',

  // Export
  ExportFailed = 'EXPORT_FAILED',

  // Queue
  QueueClosed = 'QUEUE_CLOSED',
  QueueUnavailable = 'QUEUE_UNAVAILABLE',

  // Mailer
  MailerSendFailed = 'MAILER_SEND_FAILED',
  MailerJobNotFound = 'MAILER_JOB_NOT_FOUND',

  // Locks
  LockNotAcquired = 'LOCK_NOT_ACQUIRED'
}

/** The error codes starting with the prefix of a module, i.e. `'RESOURCE'`. */
export type ModuleErrorCode<P extends string> = Extract<
  ErrorCode,
  `${P}_${string}`
>;

/** The error codes of a request rejected before reaching any module. */
export type RequestErrorCode =
  | ErrorCode.InternalError
  | ErrorCode.ValidationFailed
  | ErrorCode.MalformedRequest
  | ErrorCode.UnsupportedMediaType
  | ErrorCode.PayloadTooLarge
  | ErrorCode.RouteNotFound
  | ErrorCode.RateLimited
  | ErrorCode.RequestFailed;
