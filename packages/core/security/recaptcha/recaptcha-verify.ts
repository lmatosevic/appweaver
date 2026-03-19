import { config, logger } from '@appweaver/common';
import { HttpError } from '../../errors';

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
    throw new HttpError('reCAPTCHA request failed', 500);
  }

  const data: ReCaptchaResponse = await resp.json();

  logger.debug(data, 'reCAPTCHA verified');

  if (!data.success) {
    throw new HttpError('reCAPTCHA invalid token', 400);
  }

  if (action && data.action !== action) {
    throw new HttpError('reCAPTCHA action mismatch', 403);
  }

  if (data.score < config.SECURITY_RECAPTCHA_MIN_SCORE) {
    throw new HttpError('reCAPTCHA low score', 403);
  }
}
