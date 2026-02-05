export type PolicyAction = 'find' | 'create' | 'update';

export type FileAccessType = 'protected' | 'private' | 'public';

export type FileAccessFn = (user: any, resource: any, file: any) => boolean;

export type ResourceAccessFn = (action: PolicyAction, resource: any) => boolean;

export type ResourceRestrictionFn = (
  action: PolicyAction,
  resource: any
) => any;

export type FilePolicy = {
  /**
   * **protected** - Accessible by any authenticated users. (default option)
   *
   * **private** - Accessible only by the authenticated file owner.
   *
   * **public** - Accessible by anyone without authentication.
   */
  accessType?: FileAccessType;
  canAccess?: FileAccessFn;
  canCreate?: FileAccessFn;
  canDelete?: FileAccessFn;
};

export type ResourcePolicy = {
  name?: string;
  checkAccess?: ResourceAccessFn;
  readRestrictions?: ResourceRestrictionFn;
  writeRestrictions?: ResourceRestrictionFn;
  files?: Record<string, FilePolicy>;
};
