import { FastifyReply, FastifyRequest } from 'fastify';
import { TemplateEngine } from '@appweaver/common';
import { inject, LocaleService } from '@appweaver/core';

/** A page of the sign-in of the MCP clients, the `mcp/<page>.html` template when the application has one. */
export type OAuthPage = 'sign-in' | 'password' | 'two-factor' | 'error';

/** The data of a page, rendered by its template or by the built-in plain HTML. */
export type OAuthPageData = {
  /** `sign-in`: the name of the client and the host it redirects to */
  client?: string;
  host?: string;
  /** `sign-in`: the links of the OAuth2 providers */
  providers?: { name: string; url: string }[];
  /** The URL the form posts to, and its single-use state */
  action?: string;
  state?: string;
  /** `two-factor`: the methods of the user, and what to enter for the selected one */
  methods?: { value: string; label: string; selected: boolean }[];
  hint?: string;
  /** The error of a form, or the message of the `error` page */
  error?: string;
  message?: string;
};

const TITLE_KEYS: Record<OAuthPage, string> = {
  'sign-in': 'mcp.signIn.title',
  password: 'mcp.password.title',
  'two-factor': 'mcp.twoFactor.title',
  error: 'mcp.error.title'
};

/** The locale of a request, the first of its `Accept-Language` header, resolved along the fallbacks. */
export function requestLocale(request: FastifyRequest): string | undefined {
  return (
    request.headers['accept-language']?.split(/[,;]/)[0]?.trim() || undefined
  );
}

/** Translates a key of the pages into a locale. */
export function translate(
  key: string,
  locale?: string,
  params?: Record<string, string>
): string {
  return inject(LocaleService).translate(key, locale, params);
}

/**
 * Sends a page of the sign-in, never cached nor framed: the `mcp/<page>.html` template of the template engine when
 * the application has one, otherwise a plain HTML page.
 *
 * @param {FastifyReply} reply - The reply.
 * @param {OAuthPage} page - The page.
 * @param {OAuthPageData} data - The data of the page.
 * @param {string} [locale] - The locale of the texts.
 * @param {number} [status=200] - The status of the response.
 * @return {Promise<FastifyReply>} The reply.
 */
export async function sendPage(
  reply: FastifyReply,
  page: OAuthPage,
  data: OAuthPageData,
  locale?: string,
  status: number = 200
): Promise<FastifyReply> {
  const engine = inject(TemplateEngine, false);
  const name = `mcp/${page}.html`;
  const html =
    engine && (await engine.hasTemplate(name, locale))
      ? await engine.render(name, data, { locale })
      : plainPage(page, data, (key, params) =>
          escapeHtml(translate(key, locale, params))
        );
  return reply
    .code(status)
    .headers({
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'"
    })
    .type('text/html; charset=utf-8')
    .send(html);
}

function plainPage(
  page: OAuthPage,
  data: OAuthPageData,
  t: (key: string, params?: Record<string, string>) => string
): string {
  const e = (text = '') => escapeHtml(text);
  const form = (fields: string) =>
    `<form method="post" action="${e(data.action)}"><input type="hidden" name="state" value="${e(data.state)}">${fields}</form>`;
  let body = '';
  switch (page) {
    case 'sign-in':
      body =
        `<p>${t('mcp.signIn.message', { client: data.client!, host: data.host! })}</p><ul>` +
        (data.providers ?? [])
          .map(({ name, url }) => `<li><a href="${e(url)}">${e(name)}</a></li>`)
          .join('') +
        '</ul>';
      break;
    case 'password':
      body =
        `<p>${t('mcp.password.message')}</p>` +
        form(
          `<p><label>${t('mcp.password.label')} <input type="password" name="password" autocomplete="current-password" required autofocus></label></p>` +
            `<button>${t('mcp.password.submit')}</button>`
        );
      break;
    case 'two-factor':
      body =
        `<p>${e(data.hint)}</p>` +
        form(
          // The verify button first, the one submitting with Enter
          `<p><label>${t('mcp.twoFactor.label')} <input name="code" autocomplete="one-time-code" autofocus></label></p>` +
            `<p><button name="action" value="verify">${t('mcp.twoFactor.submit')}</button></p>` +
            `<p><label>${t('mcp.twoFactor.method')} <select name="method">` +
            (data.methods ?? [])
              .map(
                ({ value, label, selected }) =>
                  `<option value="${e(value)}"${selected ? ' selected' : ''}>${e(label)}</option>`
              )
              .join('') +
            `</select></label> <button name="action" value="resend">${t('mcp.twoFactor.resend')}</button></p>`
        );
      break;
    case 'error':
      body = `<p>${e(data.message)}</p>`;
  }
  const title = t(TITLE_KEYS[page]);
  const error = data.error ? `<p role="alert">${e(data.error)}</p>` : '';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${title}</title></head><body><h1>${title}</h1>${error}${body}</body></html>`
  );
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!
  );
}
