import { configOverrides, ErrorCode } from '@appweaver/common';
import { testSmsContract } from '@appweaver/testing';
import { TwilioSms } from '../twilio-sms';

const credentials = {
  SMS_TWILIO_ACCOUNT_SID: 'AC123',
  SMS_TWILIO_AUTH_TOKEN: 'token',
  SMS_SENDER: '+15005550006'
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

function configure(values: Record<string, unknown>): void {
  for (const key of Object.keys(configOverrides)) {
    delete configOverrides[key];
  }
  Object.assign(configOverrides, values);
}

describe('twilio-sms', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    configure(credentials);
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(json(201, { sid: 'SM1', status: 'queued' }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    configure({});
  });

  describe('constructor', () => {
    test.each(['SMS_TWILIO_ACCOUNT_SID', 'SMS_TWILIO_AUTH_TOKEN'])(
      'fails without %s',
      (key) => {
        configure({ ...credentials, [key]: undefined });

        expect(() => new TwilioSms()).toThrow(
          expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
        );
      }
    );

    test('fails without a sender or a messaging service', () => {
      configure({ ...credentials, SMS_SENDER: undefined });

      expect(() => new TwilioSms()).toThrow(/messagingServiceSid/);
    });

    test('starts with a messaging service and no sender', () => {
      configure({
        ...credentials,
        SMS_SENDER: undefined,
        SMS_TWILIO_MESSAGING_SERVICE_SID: 'MG1'
      });

      expect(() => new TwilioSms()).not.toThrow();
    });
  });

  describe('sendSms', () => {
    test('posts the message to the Messages resource', async () => {
      await expect(
        new TwilioSms().sendSms({
          to: '+385911234567',
          text: 'Your code',
          from: '+15005550006',
          providerOptions: { StatusCallback: 'https://example.com/status' }
        })
      ).resolves.toBe(true);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json'
      );
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('AC123:token').toString('base64')}`
      );
      expect(Object.fromEntries(init.body)).toEqual({
        To: '+385911234567',
        Body: 'Your code',
        From: '+15005550006',
        StatusCallback: 'https://example.com/status'
      });
    });

    test('sends from the messaging service', async () => {
      configure({
        ...credentials,
        SMS_TWILIO_MESSAGING_SERVICE_SID: 'MG1',
        SMS_TWILIO_API_URL: 'http://localhost:4010/'
      });

      await new TwilioSms().sendSms({ to: '+385911234567', text: 'Hi' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://localhost:4010/2010-04-01/Accounts/AC123/Messages.json'
      );
      expect(Object.fromEntries(init.body)).toEqual({
        To: '+385911234567',
        Body: 'Hi',
        MessagingServiceSid: 'MG1'
      });
    });

    test('fails with the error of a rejected message', async () => {
      fetchMock.mockResolvedValue(
        json(400, { code: 21211, message: "The 'To' number is not valid" })
      );

      await expect(
        new TwilioSms().sendSms({ to: '+1', text: 'Hi' })
      ).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        message: "Twilio rejected the message: The 'To' number is not valid",
        details: { provider: 'twilio', status: 400, providerCode: 21211 }
      });
    });

    test('fails with the status of a rejection without a body', async () => {
      fetchMock.mockResolvedValue(
        new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' })
      );

      await expect(
        new TwilioSms().sendSms({ to: '+1', text: 'Hi' })
      ).rejects.toMatchObject({
        message: 'Twilio rejected the message: Bad Gateway',
        details: { provider: 'twilio', status: 502 }
      });
    });

    test('fails when the request fails', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        new TwilioSms().sendSms({ to: '+1', text: 'Hi' })
      ).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        message: 'Twilio request failed: ECONNREFUSED',
        details: { provider: 'twilio' }
      });
    });
  });

  describe('checkHealth', () => {
    const status = (
      indicator: string,
      description = 'All Systems Operational'
    ) => json(200, { status: { indicator, description } });

    test('is up while Twilio reports no outage', async () => {
      fetchMock.mockResolvedValue(status('none'));

      await expect(new TwilioSms().checkHealth()).resolves.toEqual({
        success: true
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://status.twilio.com/api/v2/status.json');
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    test('is up during a minor outage', async () => {
      fetchMock.mockResolvedValue(status('minor', 'Minor Service Outage'));

      await expect(new TwilioSms().checkHealth()).resolves.toEqual({
        success: true
      });
    });

    test.each(['major', 'critical'])(
      'is down during a %s outage',
      async (indicator) => {
        fetchMock.mockResolvedValue(status(indicator, 'Major Service Outage'));

        await expect(new TwilioSms().checkHealth()).resolves.toEqual({
          success: false,
          message: 'Major Service Outage'
        });
      }
    );

    test('names the indicator of an outage without a description', async () => {
      fetchMock.mockResolvedValue(
        json(200, { status: { indicator: 'major' } })
      );

      await expect(new TwilioSms().checkHealth()).resolves.toEqual({
        success: false,
        message: 'major'
      });
    });

    test('is up for a status without an indicator', async () => {
      fetchMock.mockResolvedValue(json(200, {}));

      await expect(new TwilioSms().checkHealth()).resolves.toMatchObject({
        success: true
      });
    });

    test('reads the configured status URL', async () => {
      configure({
        ...credentials,
        SMS_TWILIO_STATUS_URL: 'http://status.test'
      });
      fetchMock.mockResolvedValue(status('none'));

      await new TwilioSms().checkHealth();

      expect(fetchMock.mock.calls[0][0]).toBe('http://status.test');
    });

    test('is down when the status page fails', async () => {
      fetchMock.mockResolvedValue(
        new Response('', { status: 503, statusText: 'Service Unavailable' })
      );

      await expect(new TwilioSms().checkHealth()).resolves.toEqual({
        success: false,
        message: 'Twilio status unavailable: Service Unavailable'
      });
    });

    test('is down when the request fails', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(new TwilioSms().checkHealth()).resolves.toEqual({
        success: false,
        message: 'ECONNREFUSED'
      });
    });
  });
});

testSmsContract('TwilioSms', () => {
  configure(credentials);
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => json(201, { sid: 'SM1' }));
  return new TwilioSms();
});
