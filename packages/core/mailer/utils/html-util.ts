const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

/**
 * Converts an HTML document into readable plain text, the text version of an email rendered without a text
 * template. The links keep their address after the label, and the blocks are separated by line breaks.
 *
 * @param {string} html - The HTML content.
 * @return {string} The plain text content.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
      (_, doubleQuoted?: string, singleQuoted?: string, label = '') => {
        const href = doubleQuoted ?? singleQuoted ?? '';
        const labelText = label.replace(/<[^>]+>/g, '').trim();
        return !labelText || labelText === href
          ? href
          : `${labelText} (${href})`;
      }
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|table|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity);

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converts plain text into the HTML body of an email sent without one, escaping the markup characters.
 *
 * @param {string} text - The plain text content.
 * @return {string} The HTML content keeping the line breaks of the text.
 */
export function textToHtml(text: string): string {
  const escaped = text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!
  );
  return `<p style="white-space: pre-wrap;">${escaped}</p>`;
}

function decodeEntity(entity: string, name: string): string {
  if (name[0] === '#') {
    const code =
      name[1].toLowerCase() === 'x'
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
    return Number.isNaN(code) || code > 0x10ffff
      ? entity
      : String.fromCodePoint(code);
  }
  return ENTITIES[name.toLowerCase()] ?? entity;
}
