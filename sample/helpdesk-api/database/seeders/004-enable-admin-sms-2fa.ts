import { TwoFactorMethodType } from '@appweaver/common';
import { systemConfig } from '@appweaver/data';
import { db } from '@db/client';

/**
 * Verifies the phone number of the admin and enables their SMS 2FA, so every
 * sign-in of the admin is confirmed with a code sent by SMS, while 2FA stays
 * optional for the agents. The number comes from ADMIN_PHONE_NUMBER of .env;
 * without it the admin verifies a number and enables the method themselves.
 */
export async function enableAdminSmsTwoFactor(): Promise<string> {
  const phoneNumber = process.env.ADMIN_PHONE_NUMBER;
  if (!phoneNumber) {
    return 'ADMIN_PHONE_NUMBER is not set, the SMS 2FA of the admin is left for them to enable';
  }

  const admin = await db.user.update({
    where: { email: systemConfig.ADMIN_INITIAL_EMAIL },
    data: { phoneNumber, verifiedPhone: true }
  });

  await db.twoFactorMethod.create({
    data: {
      userId: admin.id,
      type: TwoFactorMethodType.Sms,
      confirmedAt: new Date()
    }
  });

  return `SMS 2FA enabled for ${admin.email}`;
}
