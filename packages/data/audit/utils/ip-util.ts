/**
 * Removes the part of a client address identifying a host: the last octet of an IPv4 address, the last 80 bits of an
 * IPv6 one.
 *
 * @param {string} ip - The address.
 * @return {string} The anonymized address.
 */
export function anonymizeIp(ip: string): string {
  const v4 = /^(::ffff:)?(\d+\.\d+\.\d+)\.\d+$/i.exec(ip);
  if (v4) {
    return `${v4[1] ?? ''}${v4[2]}.0`;
  }
  if (!ip.includes(':')) {
    return ip;
  }
  const [head] = ip.split('::');
  const groups = head ? head.split(':') : [];
  return `${groups.slice(0, 3).join(':')}::`;
}
