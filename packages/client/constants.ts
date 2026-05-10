// CAUTION: The constants in this file should not be changed without good reason.
// They are typically only modified when changes occur in other Appweaver packages
// (such as core and common) to reflect new route paths or methods.

/** Supported frameworks for generating the client class. */
export const FRAMEWORKS = ['fetch', 'angular'] as const;

/** Custom OpenAPI extension key used for extracting route prefixes and base paths to their resources. */
export const CONFIG_FIELD = 'x-appweaver-config';

/** Custom OpenAPI extension key used for extracting resources names from schema CRUD objects. */
export const CONFIG_RESOURCE_FIELD = 'x-appweaver-resource';

/** Suffix used when generating the TypeScript module type name for a resource. */
export const RESOURCE_MODULE_TYPE = 'ResourceModuleType';

/** Maps CRUD operation names to HTTP methods used for matching OpenAPI paths to `ResourceClient` methods. */
export const RESOURCE_OPERATIONS = {
  find: 'get',
  query: 'post',
  aggregate: 'post',
  create: 'post',
  update: 'put',
  delete: 'delete',
  export: 'post',
  uploadFiles: 'post',
  deleteFiles: 'post'
} as const;

/** Expected type keys for a resource used for type inference. */
export const RESOURCE_TYPES = [
  'single',
  'multiple',
  'create',
  'update',
  'queryRequest',
  'queryResponse',
  'aggregateRequest',
  'aggregateResponse',
  'exportRequest',
  'files',
  'fileUpload',
  'fileDelete'
] as const;

/** Type name used when generating the TypeScript module type for the auth module. */
export const AUTH_MODULE_TYPE = 'AuthModuleType';

/** Maps auth operation names to HTTP methods used for matchingOpenAPI paths to `AuthClient` methods.
 * The operation names are matching the real API paths (without a prefix and in camelCase format) from the OpenAPI. */
export const AUTH_OPERATIONS = {
  login: 'post',
  logout: 'post',
  refresh: 'post',
  changePassword: 'post',
  exchangeToken: 'post',
  me: 'get'
} as const;

/** Expected type keys for the auth module used for type safety. */
export const AUTH_TYPES = [
  'loginRequest',
  'authenticationResponse',
  'logoutResponse',
  'changePasswordRequest',
  'exchangeTokenRequest',
  'identity'
] as const;

/** Type name used when generating the TypeScript module type for the account module. */
export const ACCOUNT_MODULE_TYPE = 'AccountModuleType';

/** Maps account operation names to HTTP methods used for matching OpenAPI paths to `AccountClient` methods.
 * The operation names are matching the real API paths (without a prefix and in camelCase format) from the OpenAPI. */
export const ACCOUNT_OPERATIONS = {
  sendVerifyEmail: 'post',
  verifyEmail: 'post',
  verifyEmailRedirect: 'get',
  sendResetPassword: 'post',
  resetPassword: 'post',
  send2FACode: 'post',
  verify2FACode: 'post'
} as const;

/** Expected type keys for the account module which covers email verification, password reset, and 2FA req/resp. */
export const ACCOUNT_TYPES = [
  'sendEmailVerificationRequest',
  'statusResponse',
  'emailVerificationRequest',
  'sendResetPasswordRequest',
  'resetPasswordRequest',
  'send2FACodeRequest',
  'send2FAResponse',
  'verify2FARequest',
  'verify2FAResponse'
] as const;

/** Type name used when generating the TypeScript module type for the health module. */
export const HEALTH_MODULE_TYPE = 'HealthModuleType';

/** Maps health check operations to HTTP GET methods used for matching OpenAPI paths to `HealthClient` methods.
 * The operation names are matching the real API paths (without a prefix and in camelCase format) from the OpenAPI. */
export const HEALTH_OPERATIONS = { check: 'get', ready: 'get' } as const;

/** Expected type keys for the health module used for `HealthClient` response typing. */
export const HEALTH_TYPES = ['checkResponse', 'readyResponse'] as const;

/** Maps file-serving operations to HTTP GET methods used for identifying public and protected file endpoints.
 * The operation names are matching the real API paths (without a prefix and in camelCase format) from the OpenAPI. */
export const FILE_OPERATIONS = { public: 'get', protected: 'get' } as const;
