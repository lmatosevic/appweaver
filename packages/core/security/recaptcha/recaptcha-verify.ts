import { config, ErrorCode, logger } from '@appweaver/common';
import { RecaptchaError } from './recaptcha-error';

type ReCaptchaResponse = {
  success: boolean;
  score: number;
  action: string;
};

export async function recaptchaVerify(
  token: string,
  remoteIp?: string,
  action?: string
): Promise<void> {
  const params = new URLSearchParams();
  params.set('secret', config.SECURITY_RECAPTCHA_SECRET!);
  params.set('response', token);
  if (remoteIp) {
    params.set('remoteip', remoteIp);
  }

  const resp = await fetch(config.SECURITY_RECAPTCHA_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!resp.ok) {
    logger.error(`reCAPTCHA request failed: ${resp.statusText}`);
    throw new RecaptchaError(
      ErrorCode.RecaptchaUnavailable,
      'reCAPTCHA request failed'
    );
  }

  const data: ReCaptchaResponse = await resp.json();

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

  if (data.score < config.SECURITY_RECAPTCHA_MIN_SCORE) {
    throw new RecaptchaError(
      ErrorCode.RecaptchaLowScore,
      'reCAPTCHA low score'
    );
  }
}
