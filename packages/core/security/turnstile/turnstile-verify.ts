import { config, ErrorCode, logger } from '@appweaver/common';
import { TurnstileError } from './turnstile-error';

type TurnstileResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

// Error codes caused by the server configuration or by Cloudflare itself,
// rather than by the token the client sent
const UNAVAILABLE_ERROR_CODES = [
  'missing-input-secret',
  'invalid-input-secret',
  'internal-error'
];

export async function turnstileVerify(
  token: string,
  remoteIp?: string,
  action?: string
): Promise<void> {
  const params = new URLSearchParams();
  params.set('secret', config.SECURITY_TURNSTILE_SECRET!);
  params.set('response', token);
  if (remoteIp) {
    params.set('remoteip', remoteIp);
  }

  let resp: Response;
  try {
    resp = await fetch(config.SECURITY_TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch (e) {
    logger.error(e, 'Turnstile request failed');
    throw new TurnstileError(
      ErrorCode.TurnstileUnavailable,
      'Turnstile request failed',
      {},
      { cause: e }
    );
  }

  if (!resp.ok) {
    logger.error(`Turnstile request failed: ${resp.statusText}`);
    throw new TurnstileError(
      ErrorCode.TurnstileUnavailable,
      'Turnstile request failed'
    );
  }

  let data: TurnstileResponse;
  try {
    data = await resp.json();
  } catch (e) {
    logger.error(e, 'Turnstile response is not valid JSON');
    throw new TurnstileError(
      ErrorCode.TurnstileUnavailable,
      'Turnstile response is not valid JSON',
      {},
      { cause: e }
    );
  }

  logger.debug(data, 'Turnstile verified');

  if (!data.success) {
    const errorCodes = data['error-codes'] ?? [];
    if (errorCodes.some((code) => UNAVAILABLE_ERROR_CODES.includes(code))) {
      logger.error({ errorCodes }, 'Turnstile verification unavailable');
      throw new TurnstileError(
        ErrorCode.TurnstileUnavailable,
        'Turnstile verification unavailable'
      );
    }

    throw new TurnstileError(
      ErrorCode.TurnstileInvalid,
      'Turnstile invalid token',
      { errorCodes }
    );
  }

  if (action && data.action !== action) {
    throw new TurnstileError(
      ErrorCode.TurnstileActionMismatch,
      'Turnstile action mismatch'
    );
  }
}
