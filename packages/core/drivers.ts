/** The in-process drivers of core, the fallbacks of the `auto` providers, i.e. to define one in a test. */
export { MemoryCache } from './cache/memory-cache';
export { NodeEvents } from './events/node-events';
export { JsonMailer } from './mailer/json-mailer';
export { InMemory } from './memory/in-memory';
export { MemoryQueue } from './queue/memory-queue';
export { MemorySecurityStore } from './security/store/memory-security-store';
export { FilesystemStorage } from './storage/filesystem-storage';
