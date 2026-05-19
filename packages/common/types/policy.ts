import { AuthUser } from './auth';
import { File } from './file';

export type ActionType =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete';

export type FileAccessType = 'protected' | 'private' | 'public';

export type FileAccessFn<T = any, U = AuthUser> = (
  user: U,
  resource: T,
  file: File
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

export type ResourcePolicyConfig<T = any, U = AuthUser> = {
  /** Resource model name */
  modelName: string;
  /** Return false to deny the action for the given resource */
  checkAccess?: (user: U | null, resource: T, action: ActionType) => boolean;
  /** Returns additional filter constraints for read operations */
  readRestrictions?: (
    user: U | null,
    resource: T,
    action: Exclude<ActionType, 'create'>
  ) => any;
  /** Returns field restrictions applied during write operations */
  writeRestrictions?: (
    user: U | null,
    resource: T,
    action: Extract<ActionType, 'create' | 'update'>
  ) => any;
  /** Per-field file policies keyed by field name */
  files?: Record<string, FilePolicy<T>>;
};
