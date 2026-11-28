import { AuthUser } from './auth';
import { File } from './file';
import { ModelName } from './registry';
import type { ResourceMarks } from './resource';

export type ActionType =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete';

/** The actions of a resource whose events the realtime connections receive. */
export type ResourceEventAction = Extract<
  ActionType,
  'create' | 'update' | 'delete'
>;

/** A resource event a realtime connection is about to receive. */
export type ResourceEvent<T = any> = {
  /** The action changing the resource. */
  action: ResourceEventAction;
  /** The resource after the action, the deleted resource for a delete. */
  current: T;
  /** The resource before an update. */
  previous?: T;
};

/** Returns false to keep a resource event from a user, called with a null user for an anonymous connection. */
export type ResourceEventAccessFn<T = any, U = AuthUser> = (
  user: U | null,
  event: ResourceEvent<T>
) => boolean | Promise<boolean>;

export type FileAccessType = 'protected' | 'private' | 'public';

/** Returns false to deny the file action. Called with a null user when the request is not authenticated. */
export type FileAccessFn<T = any, U = AuthUser> = (
  user: U | null,
  resource: T,
  file: File
) => boolean | Promise<boolean>;

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

/** Returns false to deny the time series action on a resource. Called with a null user when the request is not
 * authenticated. */
export type SeriesAccessFn<T = any, U = AuthUser> = (
  user: U | null,
  resource: T
) => boolean | Promise<boolean>;

/** The access checks of the time series of a resource, each allowing the action when left out. */
export type SeriesPolicy<T = any> = {
  /** Custom access check for querying the points of a resource */
  canRead?: SeriesAccessFn<T>;
  /** Custom access check for writing the points of a resource */
  canWrite?: SeriesAccessFn<T>;
  /** Custom access check for deleting the points of a resource */
  canDelete?: SeriesAccessFn<T>;
};

/** The extra conditions a policy restricts the reads with, in the database filter syntax, or nothing to restrict
 * none. */
export type ReadRestrictions = Record<string, any> | null | undefined | void;

/** The data a policy merges into the written data, or nothing to merge none. */
export type WriteRestrictions = Record<string, any> | null | undefined | void;

export type ResourcePolicyConfig<T = any, U = AuthUser> = ResourceMarks & {
  /** Resource model name */
  modelName: ModelName;
  /** Return false to deny the action for the given resource */
  checkAccess?: (
    user: U | null,
    resource: T,
    action: ActionType
  ) => boolean | Promise<boolean>;
  /** Returns additional filter constraints for read operations, directly or as a promise */
  readRestrictions?: (
    user: U | null,
    resource: T,
    action: Exclude<ActionType, 'create'>
  ) => ReadRestrictions | Promise<ReadRestrictions>;
  /** Returns field restrictions applied during write operations, directly or as a promise */
  writeRestrictions?: (
    user: U | null,
    resource: T,
    action: Extract<ActionType, 'create' | 'update'>
  ) => WriteRestrictions | Promise<WriteRestrictions>;
  /** Per-field file policies keyed by field name */
  files?: Record<string, FilePolicy<T>>;
  /** Access checks of the time series of the resource */
  series?: SeriesPolicy<T>;
  /** Returns false to keep a resource event from the realtime connection of a user, replacing the default check of
   * the event: the `checkAccess` of a `find` and the `readRestrictions` matched against the resource */
  events?: ResourceEventAccessFn<T, U>;
};
