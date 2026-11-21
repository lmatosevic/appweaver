import { anonymizeIp } from '../../../audit/utils/ip-util';

describe('ip-util', () => {
  describe('anonymizeIp', () => {
    test.each([
      ['192.168.1.42', '192.168.1.0'],
      ['::ffff:10.0.0.7', '::ffff:10.0.0.0'],
      ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', '2001:0db8:85a3::'],
      ['2001:db8::1', '2001:db8::'],
      ['::1', '::'],
      ['localhost', 'localhost']
    ])('anonymizes %s as %s', (ip, anonymized) => {
      expect(anonymizeIp(ip)).toBe(anonymized);
    });
  });
});
