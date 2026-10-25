import { ErrorCode, createLogger, RecaptchaError } from '@appweaver/common';
import { recaptchaConfig } from '../security-config';

const logger = createLogger('security');

type ReCaptchaResponse = {
  success: boolean;
  score: number;
  action: string;
};

/**
 * Verifies a reCAPTCHA token with the verification endpoint.
 *
 * @param {string} token - The token sent by the client.
 * @param {string} [remoteIp] - The IP address of the client.
 * @param {string} [action] - The action the token must have been issued for.
 * @throws {RecaptchaError} If the endpoint is unavailable, the token is invalid, issued for another action, or scored
 * below the configured threshold.
 */
export async function recaptchaVerify(
  token: string,
  remoteIp?: string,
  action?: string
): Promise<void> {
  const params = new URLSearchParams();
  params.set('secret', recaptchaConfig.SECRET!);
  params.set('response', token);
  if (remoteIp) {
    params.set('remoteip', remoteIp);
  }

  let resp: Response;
  try {
    resp = await fetch(recaptchaConfig.VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch (e) {
    logger.error(e, 'reCAPTCHA request failed');
    throw new RecaptchaError(
      ErrorCode.RecaptchaUnavailable,
      'reCAPTCHA request failed',
      {},
      { cause: e }
    );
  }

  if (!resp.ok) {
    logger.error(`reCAPTCHA request failed: ${resp.statusText}`);
    throw new RecaptchaError(
      ErrorCode.RecaptchaUnavailable,
      'reCAPTCHA request failed'
    );
  }

  let data: ReCaptchaResponse;
  try {
    data = await resp.json();
  } catch (e) {
    logger.error(e, 'reCAPTCHA response is not valid JSON');
    throw new RecaptchaError(
      ErrorCode.RecaptchaUnavailable,
      'reCAPTCHA response is not valid JSON',
      {},
      { cause: e }
    );
  }

  logger.debug(data, 'reCAPTCHA verified');

  if (!data.success) {
    throw new RecaptchaError(
      ErrorCode.RecaptchaInvalid,
      'reCAPTCHA invalid token'
    );
  }

  if (action && data.action !== action) {
    throw new RecaptchaError(
      ErrorCode.RecaptchaActionMismatch,
      'reCAPTCHA action mismatch'
    );
  }

  if (data.score < recaptchaConfig.MIN_SCORE) {
    throw new RecaptchaError(
      ErrorCode.RecaptchaLowScore,
      'reCAPTCHA low score'
    );
  }
}
