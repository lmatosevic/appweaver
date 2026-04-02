export type ActionType =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete';

export type FileAccessType = 'protected' | 'private' | 'public';

export type FileAccessFn<T = any> = (
  user: any,
  resource: T,
  file: any
) => boolean;

export type FilePolicy<T = any> = {
  /**
   * **protected** - Accessible by any authenticated identities. (default option)
   *
   * **private** - Accessible only by the authenticated file owner.
   *
   * **public** - Accessible by anyone without authentication.
   */
  accessType?: FileAccessType;
  /** Custom access check for reading a file */
  canAccess?: FileAccessFn<T>;
  /** Custom access check for uploading a file */
  canCreate?: FileAccessFn<T>;
  /** Custom access check for deleting a file */
  canDelete?: FileAccessFn<T>;
};

export type ResourcePolicyConfig<T = any> = {
  /** Resource model name */
  modelName: string;
  /** Return false to deny the action for the given resource */
  checkAccess?: (action: ActionType, resource: T) => boolean;
  /** Returns additional filter constraints for read operations */
  readRestrictions?: (
    action: Exclude<ActionType, 'create'>,
    resource: T
  ) => any;
  /** Returns field restrictions applied during write operations */
  writeRestrictions?: (
    action: Extract<ActionType, 'create' | 'update'>,
    resource: T
  ) => any;
  /** Per-field file policies keyed by field name */
  files?: Record<string, FilePolicy<T>>;
};
