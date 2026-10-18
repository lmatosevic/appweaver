import type { Translations } from './locale-service';

/** The English translations of the framework's own templates, used when no translation file of the application
 * defines a key. */
export const defaultTranslations: Translations = {
  emails: {
    greeting: 'Hello,',
    linkHint:
      'If the button does not work, copy and paste the following link into your browser:',
    footer: 'This email was sent by {appName}.',
    verifyEmail: {
      subject: 'Verify your email address',
      message: 'Please verify your email address by following the link below.',
      action: 'Verify email address'
    },
    passwordReset: {
      subject: 'Password reset request',
      message:
        'We received a request to reset the password of your account. Follow the link below to choose a new one.',
      action: 'Reset password',
      ignore:
        'If you did not request a password reset, you can safely ignore this email.'
    },
    twoFactorCode: {
      subject: 'Your verification code',
      message: 'Please enter the following code to continue:',
      expires:
        'The code expires in {count, plural, one {# minute} other {# minutes}}.'
    }
  }
};
