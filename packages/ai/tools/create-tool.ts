import { Static, TSchema } from '@sinclair/typebox';
import { ConfigurationError, createLogger, ErrorCode } from '@appweaver/common';
import { define, injectAll } from '@appweaver/core';
import { AiMessage, AiToolCall } from '../types';

const logger = createLogger('ai');

/** The key of the tools in the application context. */
export const AI_TOOL = Symbol.for('appweaver.AiTool');

/** The names the OpenAI-compatible APIs accept for a tool. */
const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** What the `execute` of a tool receives besides its arguments. */
export type AiToolContext = {
  /** The call of the model */
  toolCall: AiToolCall;
  /** The messages of the conversation so far */
  messages: AiMessage[];
  /** Aborted with the call of the model */
  signal?: AbortSignal;
};

/** A tool the model may call. */
export type AiTool<P extends TSchema = TSchema, R = unknown> = {
  /** Letters, digits, `_` and `-`, i.e. `getWeather` */
  name: string;
  /** The TypeBox schema of the arguments, validated before `execute` runs */
  parameters: P;
  /** Read by the model to decide when to call the tool */
  description?: string;
  /**
   * Runs the tool, as the user of the call. Its result (or the message of its error) is sent back to the model.
   * Without it, a call of the tool ends the call, returning the tool calls to the caller.
   */
  execute?: (args: Static<P>, context: AiToolContext) => R | Promise<R>;
};

/**
 * Creates a tool, registered under its name so a prompt can name it (a queued prompt must).
 *
 * @example
 * export const getWeather = createAiTool({
 *   name: 'getWeather',
 *   description: 'The current weather of a city',
 *   parameters: Type.Object({ city: Type.String() }),
 *   execute: async ({ city }) => weather.current(city)
 * });
 *
 * @param {AiTool} tool - The name, the description, the parameters and the function of the tool.
 * @return {AiTool} The tool.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an invalid name, or one already taken.
 */
export function createAiTool<P extends TSchema, R = unknown>(
  tool: AiTool<P, R>
): AiTool<P, R> {
  validateToolName(tool.name);
  if (findAiTool(tool.name)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `AI tool '${tool.name}' is already defined`
    );
  }
  // Wrapped in an object, since the context would instantiate a function
  define({ tool }, AI_TOOL, 'append');
  logger.debug({ tool: tool.name }, 'Created AI tool');
  return tool;
}

/** Lists the tools of {@link createAiTool}. */
export function aiTools(): AiTool[] {
  return injectAll<{ tool: AiTool }>(AI_TOOL).map((entry) => entry.tool);
}

/** Finds a tool of {@link createAiTool} by its name. */
export function findAiTool(name: string): AiTool | undefined {
  return aiTools().find((tool) => tool.name === name);
}

/**
 * Checks the name of a tool.
 *
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for a name the APIs refuse.
 */
export function validateToolName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Invalid AI tool name '${name}': up to 64 letters, digits, '_' and '-'`
    );
  }
}
