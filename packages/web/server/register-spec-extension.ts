import { CONFIG_NAME } from '@appweaver/common';
import { define, injectAll } from '@appweaver/core';

/** The key of the extensions of the OpenAPI document in the application context. */
export const SPEC_EXTENSION = Symbol.for('appweaver.SpecExtension');

/** A registered extension of the OpenAPI document, as it is stored in the application context. */
export type SpecExtensionEntry = { name: string; build: () => unknown };

/**
 * Registers an extension of the OpenAPI document, the `x-appweaver-<name>` property of its root, built when the
 * document is generated, i.e. the channels and actions of `@appweaver/realtime` the generated client is typed with.
 *
 * @param {string} name - The name of the extension, i.e. `realtime` for `x-appweaver-realtime`.
 * @param {Function} build - Builds the value of the extension.
 */
export function registerSpecExtension(
  name: string,
  build: () => unknown
): void {
  define(
    { name, build } satisfies SpecExtensionEntry,
    SPEC_EXTENSION,
    'append'
  );
}

/**
 * Adds the registered extensions to an OpenAPI document.
 *
 * @param {Object} document - The OpenAPI document.
 * @return {Object} The same document, with the extensions.
 */
export function addSpecExtensions<T extends Record<string, unknown>>(
  document: T
): T {
  for (const { name, build } of injectAll<SpecExtensionEntry>(SPEC_EXTENSION)) {
    (document as Record<string, unknown>)[`x-${CONFIG_NAME}-${name}`] = build();
  }
  return document;
}
