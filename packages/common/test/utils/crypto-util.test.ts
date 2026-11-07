import { decryptText, encryptText, safeEqual } from '../../utils/crypto-util';

describe('encryptText', () => {
  test('should encrypt a text into a versioned payload', () => {
    const payload = encryptText('secret', 'key');

    expect(payload).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(payload).not.toContain('secret');
  });

  test('should encrypt the same text differently every time', () => {
    expect(encryptText('secret', 'key')).not.toBe(encryptText('secret', 'key'));
  });
});

describe('decryptText', () => {
  test('should decrypt a text encrypted with the same key', () => {
    const payload = encryptText('JBSWY3DPEHPK3PXP', 'key');

    expect(decryptText(payload, 'key')).toBe('JBSWY3DPEHPK3PXP');
  });

  test('should decrypt an empty text', () => {
    expect(decryptText(encryptText('', 'key'), 'key')).toBe('');
  });

  test('should fail with another key', () => {
    const payload = encryptText('secret', 'key');

    expect(() => decryptText(payload, 'other')).toThrow();
  });

  test('should fail for a changed ciphertext', () => {
    const [version, iv, tag] = encryptText('secret', 'key').split(':');
    const changed = [
      version,
      iv,
      tag,
      Buffer.from('other').toString('base64url')
    ];

    expect(() => decryptText(changed.join(':'), 'key')).toThrow();
  });

  test.each(['', 'v1', 'v2:a:b:c', 'v1:a:b'])(
    'should fail for the malformed payload %p',
    (payload) => {
      expect(() => decryptText(payload, 'key')).toThrow(
        'Malformed encrypted text'
      );
    }
  );
});

describe('safeEqual', () => {
  test('should compare texts', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  test('should compare texts of different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
