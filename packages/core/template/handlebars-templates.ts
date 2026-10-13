/** The layout of the framework's own emails, overridden by a `layouts/email.html.hbs` file of the application. */
const emailLayout = `<!DOCTYPE html>
<html lang="{{@locale}}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{title}}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f5f7">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7">
      <tr>
        <td align="center" style="padding: 32px 16px">
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="max-width: 560px; background-color: #ffffff; border-radius: 8px"
          >
            <tr>
              <td
                style="padding: 32px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #1f2933"
              >
                {{> @partial-block}}
              </td>
            </tr>
          </table>
          <p
            style="margin: 16px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px; color: #7b8794"
          >
            {{t "emails.footer" appName=@app.name}}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const emailButton = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0">
  <tr>
    <td style="border-radius: 6px; background-color: #2563eb">
      <a
        href="{{href}}"
        target="_blank"
        style="display: inline-block; padding: 12px 24px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 6px"
      >{{label}}</a>
    </td>
  </tr>
</table>
<p style="font-size: 13px; line-height: 20px; color: #52606d">
  {{t "emails.linkHint"}}<br />
  <a href="{{href}}" style="color: #2563eb; word-break: break-all">{{href}}</a>
</p>
`;

/** The emails' text footer, shared by their plain text versions. */
const textFooter = `--
{{t "emails.footer" appName=@app.name}}
`;

/**
 * The framework's own templates, keyed by the template name. A template file of the same name in `TEMPLATE_PATH`
 * overrides one, and the translations of their texts are overridden by the translation files.
 */
export const handlebarsTemplates: Record<string, string> = {
  'layouts/email.html': emailLayout,
  'partials/email-button.html': emailButton,
  'partials/email-footer.txt': textFooter,

  'emails/verify-email.subject': `{{t "emails.verifyEmail.subject"}}`,
  'emails/verify-email.html': `{{#> layouts/email.html title=(t "emails.verifyEmail.subject")}}
<p>{{t "emails.greeting"}}</p>
<p>{{t "emails.verifyEmail.message"}}</p>
{{> partials/email-button.html href=link label=(t "emails.verifyEmail.action")}}
{{/layouts/email.html}}
`,
  'emails/verify-email.txt': `{{t "emails.greeting"}}

{{t "emails.verifyEmail.message"}}

{{link}}

{{> partials/email-footer.txt}}`,

  'emails/password-reset.subject': `{{t "emails.passwordReset.subject"}}`,
  'emails/password-reset.html': `{{#> layouts/email.html title=(t "emails.passwordReset.subject")}}
<p>{{t "emails.greeting"}}</p>
<p>{{t "emails.passwordReset.message"}}</p>
{{> partials/email-button.html href=link label=(t "emails.passwordReset.action")}}
<p>{{t "emails.passwordReset.ignore"}}</p>
{{/layouts/email.html}}
`,
  'emails/password-reset.txt': `{{t "emails.greeting"}}

{{t "emails.passwordReset.message"}}

{{link}}

{{t "emails.passwordReset.ignore"}}

{{> partials/email-footer.txt}}`,

  'emails/two-factor-code.subject': `{{t "emails.twoFactorCode.subject"}}`,
  'emails/two-factor-code.html': `{{#> layouts/email.html title=(t "emails.twoFactorCode.subject")}}
<p>{{t "emails.greeting"}}</p>
<p>{{t "emails.twoFactorCode.message"}}</p>
<p style="margin: 24px 0; font-size: 32px; line-height: 40px; font-weight: bold; letter-spacing: 8px">{{code}}</p>
<p>{{t "emails.twoFactorCode.expires" count=expiresInMinutes}}</p>
{{/layouts/email.html}}
`,
  'emails/two-factor-code.txt': `{{t "emails.greeting"}}

{{t "emails.twoFactorCode.message"}}

{{code}}

{{t "emails.twoFactorCode.expires" count=expiresInMinutes}}

{{> partials/email-footer.txt}}`
};
