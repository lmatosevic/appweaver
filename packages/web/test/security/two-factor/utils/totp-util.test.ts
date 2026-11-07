import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  totpStep,
  totpUri,
  verifyTotp
} from '../../../../security/two-factor/utils/totp-util';

/** The secret of the RFC 4226 and RFC 6238 test vectors, the ASCII text `12345678901234567890`. */
const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));

describe('base32Encode', () => {
  test.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI']
  ])('should encode %p as the RFC 4648 vector %p', (text, encoded) => {
    expect(base32Encode(Buffer.from(text))).toBe(encoded);
  });
});

describe('base32Decode', () => {
  test('should decode an encoded text', () => {
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
  });

  test('should ignore the case, the spaces and the padding', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
  });

  test('should fail for a character outside the alphabet', () => {
    expect(() => base32Decode('MZ1W')).toThrow("Invalid Base32 character '1'");
  });
});

describe('generateTotpSecret', () => {
  test('should generate a 160 bit secret in Base32', () => {
    const secret = generateTotpSecret();

    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  test('should generate a different secret every time', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('totpStep', () => {
  test('should count the whole periods since the epoch', () => {
    expect(totpStep(59_000)).toBe(1);
    expect(totpStep(60_000)).toBe(2);
    expect(totpStep(60_000, 60)).toBe(1);
  });

  test('should default to the current time', () => {
    expect(totpStep()).toBe(Math.floor(Date.now() / 30_000));
  });
});

describe('totpCode', () => {
  test.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [9, '520489']
  ])('should compute the RFC 4226 HOTP vector of counter %p', (step, code) => {
    expect(totpCode(rfcSecret, step)).toBe(code);
  });

  test.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
  ])('should compute the RFC 6238 SHA1 vector at %p s', (seconds, code) => {
    expect(totpCode(rfcSecret, totpStep(seconds * 1000), 8)).toBe(code);
  });
});

describe('verifyTotp', () => {
  const time = 1111111111_000;
  const step = totpStep(time);

  test('should return the step of the current code', () => {
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step), { time })).toBe(
      step
    );
  });

  test('should accept the codes of the window, for clock drift', () => {
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 1), { time })).toBe(
      step - 1
    );
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step + 1), { time })).toBe(
      step + 1
    );
  });

  test('should reject the codes outside the window', () => {
    const code = totpCode(rfcSecret, step - 2);

    expect(verifyTotp(rfcSecret, code, { time })).toBeNull();
    expect(verifyTotp(rfcSecret, code, { time, window: 2 })).toBe(step - 2);
    expect(
      verifyTotp(rfcSecret, totpCode(rfcSecret, step - 1), {
        time,
        window: 0
      })
    ).toBeNull();
  });

  test('should accept a code with spaces', () => {
    const code = totpCode(rfcSecret, step);

    expect(
      verifyTotp(rfcSecret, `${code.slice(0, 3)} ${code.slice(3)}`, { time })
    ).toBe(step);
  });

  test.each(['', '12345', '1234567', 'abcdef'])(
    'should reject the malformed code %p',
    (code) => {
      expect(verifyTotp(rfcSecret, code, { time })).toBeNull();
    }
  );

  test('should verify the codes of other digits and periods', () => {
    const code = totpCode(rfcSecret, totpStep(time, 60), 8);

    expect(verifyTotp(rfcSecret, code, { time, digits: 8, period: 60 })).toBe(
      totpStep(time, 60)
    );
  });

  test('should skip the steps before the epoch', () => {
    expect(
      verifyTotp(rfcSecret, totpCode(rfcSecret, 0), { time: 0, window: 1 })
    ).toBe(0);
  });

  test('should default to the current time', () => {
    const now = totpStep();

    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, now))).not.toBeNull();
  });
});

describe('totpUri', () => {
  test('should build the otpauth URI of the secret', () => {
    expect(
      totpUri({
        secret: 'JBSWY3DPEHPK3PXP',
        issuer: 'Acme Inc',
        account: 'jane@example.com'
      })
    ).toBe(
      'otpauth://totp/Acme%20Inc:jane%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme+Inc&algorithm=SHA1&digits=6&period=30'
    );
  });

  test('should include the digits and the period', () => {
    const uri = new URL(
      totpUri({
        secret: 'JBSWY3DPEHPK3PXP',
        issuer: 'Acme',
        account: 'jane',
        digits: 8,
        period: 60
      })
    );

    expect(uri.searchParams.get('digits')).toBe('8');
    expect(uri.searchParams.get('period')).toBe('60');
  });
});
