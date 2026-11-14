/** The internals of data the CLI builds on, which can change in a minor release. */
export { pruneUnusedModels } from './resource/utils/prune-util';
export { setupDatabase } from './database/setup-database';
export type {
  SetupDatabaseParams,
  SetupDatabaseResult
} from './database/setup-database';
