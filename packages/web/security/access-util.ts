import { AuthScope, ValidationResult } from '@appweaver/common';
import { accountConfig, securityConfig } from './security-config';

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

  const allowedHosts = securityConfig.ALLOWED_REDIRECT_HOSTS;
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
  const securityPrefix = securityConfig.ROUTE_PREFIX.replace(/\/$/, '');
  const accountPrefix = accountConfig.ROUTE_PREFIX.replace(/\/$/, '');

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
