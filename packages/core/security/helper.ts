import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { requestContext } from '@fastify/request-context';
import {
  AuthScope,
  AuthSource,
  AuthType,
  AuthUser,
  config,
  IResourceService,
  isResourceAuthModel,
  isResourceAuthService,
  RESOURCE_NAME,
  ResourceModel,
  ValidationResult
} from '@appweaver/common';
import { HttpError } from '../errors';
import { context, injectService } from '../context';

type Argon2Params = { m: number; t: number; p: number };

/** The Argon2id cost of new password hashes (OWASP minimum): m KiB of memory, t passes, p lanes. Each hash stores its
 * own, and {@link needsRehash} flags the ones made with other parameters */
const ARGON2_PARAMS: Argon2Params = { m: 19456, t: 2, p: 1 };

const ARGON2_VERSION = 19;

const ARGON2_SALT_BYTES = 16;

const ARGON2_KEY_BYTES = 32;

/** A stored hash in the PHC string format, i.e. `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<key>` with unpadded base64
 * salt and key */
const ARGON2_HASH_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d{1,7}),t=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]{11,})\$([A-Za-z0-9+/]{6,})$/;

/**
 * Evaluates and retrieves the resource authentication model from the available resource models.
 *
 * The function iterates through the resource models in the given context and returns the first model
 * that satisfies the `isResourceAuthModel` condition. If no such model is found, it returns undefined.
 *
 * @return {ResourceModel | undefined} The resource authentication model if present, otherwise undefined.
 */
export function resourceAuthModel(): ResourceModel | undefined {
  for (const model of context.resource.models.values()) {
    if (isResourceAuthModel(model)) {
      return model;
    }
  }
}

/**
 * Provides authentication service for a resource by identifying and injecting
 * the appropriate resource authentication service if available.
 *
 * @return {IResourceService<AuthUser, AuthUser> | undefined} The resource authentication service
 *         instance if found, otherwise undefined.
 */
export function resourceAuthService():
  | IResourceService<AuthUser, AuthUser>
  | undefined {
  for (const service of context.resource.services.values()) {
    if (isResourceAuthService(service)) {
      return injectService(service[RESOURCE_NAME]);
    }
  }
}

/**
 * Retrieves the currently authenticated user from the request context.
 *
 * @return {AuthUser | null | undefined} The authenticated user object if available,
 * null if no user is authenticated, or undefined if the context does not contain
 * authentication information.
 */
export function currentAuthUser(): AuthUser | null | undefined {
  return requestContext.get('authUser');
}

/**
 * Retrieves the current authentication type from the request context.
 *
 * @return {AuthType | null | undefined} The authentication type if available; otherwise, returns null or undefined.
 */
export function currentAuthType(): AuthType | null | undefined {
  return requestContext.get('authType');
}

/**
 * Retrieves the current authentication source from the request context.
 *
 * @return {AuthSource | null | undefined} The authentication source if available; otherwise, null or undefined
 * if it is not set.
 */
export function currentAuthSource(): AuthSource | null | undefined {
  return requestContext.get('authSource');
}

/**
 * Hashes a plain text password with the Argon2id function of the runtime and a random salt. The hash holds the
 * Argon2 parameters and the salt, in the PHC string format `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<key>`.
 *
 * @param {string} password - The plain text password to be hashed.
 * @return {Promise<string>} A promise that resolves to the hashed password.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(ARGON2_SALT_BYTES);
  const key = await deriveKey(password, salt, ARGON2_PARAMS, ARGON2_KEY_BYTES);

  const { m, t, p } = ARGON2_PARAMS;
  return `$argon2id$v=${ARGON2_VERSION}$m=${m},t=${t},p=${p}$${toPhcBase64(salt)}$${toPhcBase64(key)}`;
}

/**
 * Validates a plain text password against a hashed password, using the parameters stored in the hash. A hash not in
 * the form {@link hashPassword} produces never matches.
 *
 * @param {string} password - The plain text password to validate.
 * @param {string} passwordHash - The hashed password to compare against.
 * @return {Promise<boolean>} Returns a promise that resolves to `true` if the password matches the hash,
 * otherwise `false`.
 */
export async function checkPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  const parsed = parseHash(passwordHash);
  if (!parsed) {
    return false;
  }

  const key = await deriveKey(
    password,
    parsed.salt,
    parsed.params,
    parsed.key.length
  );

  return timingSafeEqual(key, parsed.key);
}

/**
 * Tells whether a password hash was made with other parameters than {@link hashPassword} uses now, so it should be
 * replaced with a new hash of the password, e.g. on the next successful login.
 *
 * @param {string} passwordHash - The stored password hash.
 * @return {boolean} `true` if the hash is not a current Argon2id hash, otherwise `false`.
 */
export function needsRehash(passwordHash: string): boolean {
  const parsed = parseHash(passwordHash);
  return (
    !parsed ||
    parsed.key.length !== ARGON2_KEY_BYTES ||
    parsed.params.m !== ARGON2_PARAMS.m ||
    parsed.params.t !== ARGON2_PARAMS.t ||
    parsed.params.p !== ARGON2_PARAMS.p
  );
}

/**
 * Updates the password hash for a given user and optionally logs the user out by setting a logout timestamp.
 *
 * @param {Partial<AuthUser>} authUser - The user object containing authentication details. Only partial fields are
 * expected.
 * @param {string} [password] - The new password to hash and set for the user. If not provided, no password update
 * occurs.
 * @param {boolean} [logout=false] - Indicates whether to log the user out by setting the logout timestamp.
 * @return Resolves when the password hash is updated and optional logout processing is complete.
 * @throws {HttpError} If the provided password does not satisfy password complexity requirements.
 */
export async function updatePasswordHash(
  authUser: Partial<AuthUser>,
  password?: string,
  logout: boolean = false
): Promise<void> {
  if (password) {
    if (!config.SECURITY_PASSWORD_ENABLED) {
      throw new HttpError('Password creation is not supported', 403);
    }

    const result = validatePasswordComplexity(password);
    if (!result.valid) {
      throw new HttpError(result.message, 400);
    }

    authUser.passwordHash = await hashPassword(password);
    if (logout) {
      authUser.logoutAt = new Date();
    }
  }
  delete authUser['password'];
}

/**
 * Validates the complexity of a given password based on the configured rules.
 * @param {string} password - The password to be validated.
 * @return {ValidationResult} An object with the validation result and message.
 */
export function validatePasswordComplexity(password: string): ValidationResult {
  const minLength = config.SECURITY_PASSWORD_MIN_LENGTH;
  if (password.length < minLength) {
    return {
      valid: false,
      message: `Password must be at least ${minLength} characters long`
    };
  }

  const maxLength = config.SECURITY_PASSWORD_MAX_LENGTH;
  if (password.length > maxLength) {
    return {
      valid: false,
      message: `Password must not be longer than ${maxLength} characters`
    };
  }

  if (!/[A-Z]/.test(password) && config.SECURITY_PASSWORD_UPPERCASE) {
    return {
      valid: false,
      message: `Password must have at least one uppercase character`
    };
  }

  if (!/[a-z]/.test(password) && config.SECURITY_PASSWORD_LOWERCASE) {
    return {
      valid: false,
      message: `Password must have at least one lowercase character`
    };
  }

  if (!/[0-9]/.test(password) && config.SECURITY_PASSWORD_NUMERIC) {
    return {
      valid: false,
      message: `Password must have at least one numeric character`
    };
  }

  if (!/[^A-Za-z0-9]/.test(password) && config.SECURITY_PASSWORD_SPECIAL) {
    return {
      valid: false,
      message: `Password must have at least one special character`
    };
  }

  return { valid: true, message: 'OK' };
}

/**
 * Checks whether at least one OAuth2 provider is enabled, by resolving each OAuth2 auth source to its
 * `SECURITY_OAUTH2_<PROVIDER>_ENABLED` config flag. New providers are picked up automatically as long as they follow
 * that naming convention.
 *
 * @return {boolean} True when any OAuth2 provider is enabled.
 */
export function isOAuth2Enabled(): boolean {
  return Object.values(AuthSource)
    .filter((source) => source.startsWith('oauth2'))
    .some(
      (source) =>
        config[
          `SECURITY_OAUTH2_${source.replace('oauth2', '').toUpperCase()}_ENABLED`
        ] === true
    );
}

/**
 * Validates a URL and checks if it's allowed based on the configured list of allowed hosts.
 *
 * @param {string} url - The URL string to validate.
 * @return {ValidationResult} An object containing validation result and message.
 */
export function validateRedirectUrl(url: string): ValidationResult {
  try {
    new URL(url);
  } catch (e) {
    return {
      valid: false,
      message: `Invalid URL format: ${url}`
    };
  }

  const checkUrl = new URL(url);

  const allowedHosts = config.SECURITY_ALLOWED_REDIRECT_HOSTS;
  if (
    !allowedHosts.includes('*') &&
    !allowedHosts.includes(checkUrl.hostname)
  ) {
    return {
      valid: false,
      message: `The URL hostname '${checkUrl.hostname}' is not allowed`
    };
  }

  return {
    valid: true,
    message: 'URL is valid and allowed'
  };
}

/**
 * Checks whether the provided URL is accessible based on the user's JWT payload `scope` property.
 *
 * @param {string} url - The URL path being accessed.
 * @param {AuthScope} authScope - The `scope` property from the decoded JWT payload.
 * @return {boolean} Returns true if the URL is accessible based on the scope; false otherwise.
 */
export function checkScopeAccess(url: string, authScope: AuthScope): boolean {
  const securityPrefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');
  const accountPrefix = config.SECURITY_ACCOUNT_ROUTE_PREFIX.replace(/\/$/, '');

  const refreshPath = `${securityPrefix}/refresh`;
  const twoFASendPath = `${accountPrefix}/send-2fa-code`;
  const twoFAVerifyPath = `${accountPrefix}/verify-2fa-code`;

  const scopeConfigs: {
    scope: AuthScope;
    allowedPaths?: string[];
    disallowedPaths?: string[];
  }[] = [
    {
      scope: AuthScope.Auth,
      disallowedPaths: [refreshPath, twoFASendPath, twoFAVerifyPath]
    },
    {
      scope: AuthScope.Refresh,
      allowedPaths: [refreshPath]
    },
    {
      scope: AuthScope.TwoFA,
      allowedPaths: [twoFASendPath, twoFAVerifyPath]
    }
  ];

  const scopeConfig = scopeConfigs.find(({ scope }) => scope === authScope);
  if (!scopeConfig) {
    return false;
  }

  const { allowedPaths, disallowedPaths } = scopeConfig;

  return (
    (allowedPaths !== undefined && allowedPaths.includes(url)) ||
    (disallowedPaths !== undefined && !disallowedPaths.includes(url))
  );
}

/**
 * Checks if the given user has a specific role.
 *
 * @param {AuthUser} authUser - The authenticated user object containing role information.
 * @param {string} role - The name of the role to check for.
 * @return {boolean} True if the user has the specified role; otherwise, false.
 */
export function hasRole(authUser: AuthUser, role: string): boolean {
  return authUser.roles.some((r) => r.name === role);
}

/**
 * Checks if the authenticated user has the required roles based on the specified operator.
 *
 * @param {AuthUser} authUser - The authenticated user whose roles are being checked.
 * @param {Array<string> | undefined} roles - The list of roles to check against. If undefined, the method returns
 * true`.
 * @param {'or' | 'and'} [operator='or'] - The logical operator for role matching. Use 'or' to check if the user has at
 * least one role, and 'and' to check if the user has all roles.
 * @return {boolean} Returns `true` if the user satisfies the role check based on the specified operator, otherwise
 * `false`.
 */
export function hasRoles(
  authUser: AuthUser,
  roles: Array<string> | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!roles) {
    return true;
  }

  const predicate = (role: string) => hasRole(authUser, role);

  return operator === 'and' ? roles.every(predicate) : roles.some(predicate);
}

/**
 * Determines if the authenticated user has the specified permission.
 *
 * @param {AuthUser} authUser - The authenticated user object containing roles and permissions.
 * @param {string} permission - The name of the permission to check for.
 * @return {boolean} Returns true if the user has the specified permission, otherwise false.
 */
export function hasPermission(authUser: AuthUser, permission: string): boolean {
  return authUser.roles
    .flatMap((r) => r.permissions)
    .some((p) => p.name === permission);
}

/**
 * Checks if the authenticated user has the specified permissions based on the given operator.
 *
 * @param {AuthUser} authUser - The authenticated user object.
 * @param {string[] | undefined} permissions - The list of permissions to check. If undefined, it defaults to granting
 * access.
 * @param {'or' | 'and'} [operator='or'] - Determines whether all permissions (and) or at least one permission (or) must
 * be satisfied.
 * @return {boolean} Returns true if the user satisfies the permission requirements, false otherwise.
 */
export function hasPermissions(
  authUser: AuthUser,
  permissions: string[] | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!permissions) {
    return true;
  }

  const predicate = (perm: string) => hasPermission(authUser, perm);

  return operator === 'and'
    ? permissions.every(predicate)
    : permissions.some(predicate);
}

/**
 * Parses a PHC Argon2id hash, rejecting the parameters out of bounds, so a tampered hash cannot make the check exhaust
 * the memory or CPU.
 */
function parseHash(
  passwordHash: string
): { params: Argon2Params; salt: Buffer; key: Buffer } | null {
  const match = ARGON2_HASH_PATTERN.exec(passwordHash);
  if (!match || Number(match[1]) !== ARGON2_VERSION) {
    return null;
  }

  const params = {
    m: Number(match[2]),
    t: Number(match[3]),
    p: Number(match[4])
  };
  const bounded =
    params.p >= 1 &&
    params.p <= 16 &&
    params.m >= 8 * params.p &&
    params.m <= 262144 &&
    params.t >= 1 &&
    params.t <= 10;
  if (!bounded) {
    return null;
  }

  return {
    params,
    salt: Buffer.from(match[5], 'base64'),
    key: Buffer.from(match[6], 'base64')
  };
}

/**
 * Derives the Argon2id key of a password.
 */
function deriveKey(
  password: string,
  salt: Buffer,
  params: Argon2Params,
  keyBytes: number
): Promise<Buffer> {
  const parameters = {
    message: password,
    nonce: salt,
    memory: params.m,
    passes: params.t,
    parallelism: params.p,
    tagLength: keyBytes
  };

  return new Promise((resolve, reject) => {
    argon2('argon2id', parameters, (error, key) =>
      error ? reject(error) : resolve(key)
    );
  });
}

/** Encodes bytes in the unpadded base64 of the PHC string format. */
function toPhcBase64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}
