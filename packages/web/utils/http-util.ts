/**
 * The content security policy of the files users uploaded, served from the origin of the API: a document they hold,
 * i.e. an HTML page or an SVG image opened directly, runs no script, loads nothing and is treated as another origin,
 * whatever type its upload declared. A PDF keeps the policy of the server, since browsers refuse to show a sandboxed
 * one.
 */
export const USER_CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

/**
 * Builds a `Content-Disposition` header value of RFC 6266, with the name as an ASCII `filename` and, when it holds
 * other characters, its UTF-8 `filename*`. A header value outside Latin-1 makes Node throw, and a quote or a
 * backslash would end the quoted name.
 *
 * @param {'inline' | 'attachment'} type - Whether the browser shows the file or saves it.
 * @param {string} fileName - The name of the file, of any characters.
 * @return {string} The header value.
 */
export function contentDisposition(
  type: 'inline' | 'attachment',
  fileName: string
): string {
  const fallback = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\%]/g, '_');
  if (fallback === fileName) {
    return `${type}; filename="${fileName}"`;
  }
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
