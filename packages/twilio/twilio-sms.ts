import {
  ConfigurationError,
  createLogger,
  ErrorCode,
  errorMessage,
  HealthCheckResult,
  SmsError,
  SmsMessage,
  SmsSender
} from '@appweaver/common';
import { smsConfig } from '@appweaver/core';
import { twilioConfig } from './config';

const logger = createLogger('sms');

const API_VERSION = '2010-04-01';

/** The error body of the Twilio API. */
type TwilioError = {
  code?: number;
  message?: string;
};

/** Sends the text messages with the Messages resource of the Twilio REST API. */
export class TwilioSms extends SmsSender {
  /** @internal */
  private readonly _accountSid: string;
  /** @internal */
  private readonly _authorization: string;

  /**
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` if the account SID or the auth token is missing, or neither a
   * sender nor a messaging service is configured.
   */
  constructor() {
    super();

    const { ACCOUNT_SID, AUTH_TOKEN, MESSAGING_SERVICE_SID } = twilioConfig;
    if (!ACCOUNT_SID || !AUTH_TOKEN) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The Twilio SMS sender needs the `sms.twilio.accountSid` and `sms.twilio.authToken` config (SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN), or disable it with SMS_PROVIDER=none'
      );
    }
    if (!smsConfig.SENDER && !MESSAGING_SERVICE_SID) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The Twilio SMS sender needs a sender number in the `sms.sender` config (SMS_SENDER), or a messaging service in `sms.twilio.messagingServiceSid` (SMS_TWILIO_MESSAGING_SERVICE_SID)'
      );
    }

    this._accountSid = ACCOUNT_SID;
    this._authorization = `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`;
  }

  /**
   * Sends a text message, from its own sender or the messaging service. The `providerOptions` are sent as additional
   * parameters of the Messages resource, i.e. `{ StatusCallback: 'https://...' }`.
   *
   * @throws {SmsError} `SMS_SEND_FAILED` if the request fails or Twilio rejects the message.
   */
  public async sendSms(message: SmsMessage): Promise<boolean> {
    const { to, text, from, providerOptions } = message;
    const messagingServiceSid = twilioConfig.MESSAGING_SERVICE_SID;

    const body = new URLSearchParams({ To: to, Body: text });
    if (from) {
      body.set('From', from);
    }
    if (messagingServiceSid) {
      body.set('MessagingServiceSid', messagingServiceSid);
    }
    for (const [key, value] of Object.entries(providerOptions ?? {})) {
      body.set(key, String(value));
    }

    const response = await this.request(
      `/Accounts/${this._accountSid}/Messages.json`,
      { method: 'POST', body }
    );
    if (!response.ok) {
      const error = await this.readError(response);
      throw new SmsError(
        ErrorCode.SmsSendFailed,
        `Twilio rejected the message: ${error.message ?? response.statusText}`,
        {
          provider: 'twilio',
          status: response.status,
          providerCode: error.code
        }
      );
    }

    const { sid, status } = (await response.json()) as {
      sid?: string;
      status?: string;
    };
    logger.debug({ sid, status }, 'Twilio message accepted');

    return true;
  }

  /**
   * Checks the status of the Twilio platform on its status page, without a request to the account, so the probes cost
   * nothing. A major or critical outage reports the sender as down.
   */
  async checkHealth(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(twilioConfig.STATUS_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(twilioConfig.TIMEOUT)
      });
      if (!response.ok) {
        return {
          success: false,
          message: `Twilio status unavailable: ${response.statusText}`
        };
      }

      const { status } = (await response.json()) as {
        status?: { indicator?: string; description?: string };
      };
      const indicator = status?.indicator ?? 'none';
      return ['major', 'critical'].includes(indicator)
        ? { success: false, message: status?.description ?? indicator }
        : { success: true };
    } catch (e) {
      return { success: false, message: errorMessage(e) };
    }
  }

  /** @internal */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${twilioConfig.API_URL.replace(/\/$/, '')}/${API_VERSION}${path}`;

    try {
      return await fetch(url, {
        ...init,
        headers: {
          Authorization: this._authorization,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(twilioConfig.TIMEOUT)
      });
    } catch (e) {
      throw new SmsError(
        ErrorCode.SmsSendFailed,
        `Twilio request failed: ${errorMessage(e)}`,
        { provider: 'twilio' },
        { cause: e }
      );
    }
  }

  /** @internal */
  private async readError(response: Response): Promise<TwilioError> {
    try {
      return (await response.json()) as TwilioError;
    } catch {
      return {};
    }
  }
}
