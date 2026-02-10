export type ActionType =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete';

export type FileAccessType = 'protected' | 'private' | 'public';

export type FileAccessFn = (identity: any, resource: any, file: any) => boolean;

export type FilePolicy = {
  /**
   * **protected** - Accessible by any authenticated identities. (default option)
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

export type ResourcePolicyConfig = {
  name: string;
  checkAccess?: (action: ActionType, resource: any) => boolean;
  readRestrictions?: (
    action: Exclude<ActionType, 'create'>,
    resource: any
  ) => any;
  writeRestrictions?: (
    action: Extract<ActionType, 'create' | 'update'>,
    resource: any
  ) => any;
  files?: Record<string, FilePolicy>;
};
