import { config, logger } from '@appweaver/common';

type ReCaptchaResponse = {
  success: boolean;
  score: number;
  action: string;
};

export type ReCaptchaResult =
  | { success: true }
  | { success: false; message: string; code: number };

export async function recaptchaVerify(
  token: string,
  remoteIp?: string,
  action?: string
): Promise<ReCaptchaResult> {
  const params = new URLSearchParams();

  if (!config.SECURITY_RECAPTCHA_SECRET) {
    return {
      success: false,
      message: 'reCAPTCHA secret is not set',
      code: 500
    };
  }

  params.set('secret', config.SECURITY_RECAPTCHA_SECRET);
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
    return { success: false, message: 'reCAPTCHA request failed', code: 500 };
  }

  const data: ReCaptchaResponse = await resp.json();

  logger.debug(data, 'reCAPTCHA verified');

  if (!data.success) {
    return {
      success: false,
      message: 'reCAPTCHA invalid token',
      code: 400
    };
  }

  if (action && data.action !== action) {
    return { success: false, message: 'reCAPTCHA action mismatch', code: 403 };
  }

  if (data.score < config.SECURITY_RECAPTCHA_MIN_SCORE) {
    return { success: false, message: 'reCAPTCHA low score', code: 403 };
  }

  return { success: true };
}
