import { TwoFactorMethodType } from '../enums';
import { ResourceId } from './resource-id';

export type AuthUser = {
  id: ResourceId;
  email: string;
  roles: Role[];
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  /** The verified phone number in the E.164 format, i.e. `+385911234567`, set by the phone verification. */
  phoneNumber?: string | null;
  verifiedPhone?: boolean;
  /** The confirmed two-factor methods of the user, the first one being the default. Empty when 2FA is off. */
  twoFactorMethods?: `${TwoFactorMethodType}`[];
  enabled?: boolean;
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: ResourceId | null;
  permissions?: Permission[];
};

export type Role = {
  id: ResourceId;
  name: string;
  permissions: Array<Permission>;
  updatedAt: Date;
  createdAt: Date;
  createdById?: ResourceId | null;
};

export type Permission = {
  id: ResourceId;
  name: string;
};
