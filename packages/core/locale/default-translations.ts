/** The English translations of the framework's own templates, used when no translation file of the application
 * defines a key. */
export const defaultTranslations: Record<string, string> = {
  'emails.greeting': 'Hello,',
  'emails.linkHint':
    'If the button does not work, copy and paste the following link into your browser:',
  'emails.footer': 'This email was sent by {appName}.',

  'emails.verifyEmail.subject': 'Verify your email address',
  'emails.verifyEmail.message':
    'Please verify your email address by following the link below.',
  'emails.verifyEmail.action': 'Verify email address',

  'emails.passwordReset.subject': 'Password reset request',
  'emails.passwordReset.message':
    'We received a request to reset the password of your account. Follow the link below to choose a new one.',
  'emails.passwordReset.action': 'Reset password',
  'emails.passwordReset.ignore':
    'If you did not request a password reset, you can safely ignore this email.',

  'emails.twoFactorCode.subject': 'Your verification code',
  'emails.twoFactorCode.message':
    'Please enter the following code to continue:',
  'emails.twoFactorCode.expires_one': 'The code expires in {count} minute.',
  'emails.twoFactorCode.expires_other': 'The code expires in {count} minutes.'
};
