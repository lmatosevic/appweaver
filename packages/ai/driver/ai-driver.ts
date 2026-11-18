import { AiError, ErrorCode, HealthCheckResult } from '@appweaver/common';
import {
  AiCallOptions,
  AiCapability,
  AiEmbedRequest,
  AiEmbedResponse,
  AiModelRequest,
  AiModelResponse,
  AiStreamPart
} from '../types';

/** An endpoint of the `ai.endpoints` config, completed with the defaults of its preset and of the `ai` config. */
export type AiEndpoint = {
  /** The name of the endpoint, the prefix of its model references */
  name: string;
  /** The name of the driver talking to it */
  driver: string;
  /** The capabilities of its models */
  capabilities: AiCapability[];
  /** The headers sent with every request */
  headers: Record<string, string>;
  /** The timeout of a request in milliseconds */
  timeout: number;
  /** The retries of a failed request */
  maxRetries: number;
  /** The options of the driver from the preset */
  options: Record<string, unknown>;
  /** The preset of the endpoint */
  preset?: string;
  /** The base URL of the API */
  baseUrl?: string;
  /** The API key */
  apiKey?: string;
};

/** The class of a driver, created once per endpoint using it. */
export type AiDriverClass = new (endpoint: AiEndpoint) => AiDriver;

/**
 * The driver of the endpoints speaking one API, i.e. `openai` of `@appweaver/openai` for every OpenAI-compatible
 * server. A module provides it as a provider of the `AiDriver` contract, named by its `name`, and `@appweaver/ai`
 * creates it once per endpoint using it, so a driver holds the client of its endpoint.
 *
 * A driver throws an `AiError`: `AI_RATE_LIMITED`, `AI_TIMEOUT` and `AI_PROVIDER_UNAVAILABLE` for the errors another
 * model of an alias may not have, `AI_AUTH_FAILED`, `AI_CONTEXT_LENGTH_EXCEEDED` or `AI_REQUEST_FAILED` otherwise, and
 * the reason of an aborted signal as it is.
 */
export abstract class AiDriver {
  constructor(public readonly endpoint: AiEndpoint) {}

  /**
   * Sends a request and returns the whole response.
   *
   * @param {AiModelRequest} request - The model, the messages and the parameters.
   * @param {AiCallOptions} [options] - The signal and the timeout of the call.
   * @return {Promise<AiModelResponse>} The response.
   */
  abstract generate(
    request: AiModelRequest,
    options?: AiCallOptions
  ): Promise<AiModelResponse>;

  /**
   * Sends a request and streams the response, ending with a `finish` part. The tool calls are streamed whole, once
   * their arguments are complete.
   *
   * @param {AiModelRequest} request - The model, the messages and the parameters.
   * @param {AiCallOptions} [options] - The signal and the timeout of the call.
   * @return {AsyncIterable<AiStreamPart>} The parts of the response.
   */
  abstract stream(
    request: AiModelRequest,
    options?: AiCallOptions
  ): AsyncIterable<AiStreamPart>;

  /**
   * Checks that the endpoint answers, i.e. by listing its models.
   *
   * @return {Promise<HealthCheckResult>} The result of the check.
   */
  abstract checkHealth(): Promise<HealthCheckResult>;

  /**
   * Embeds texts into vectors. A driver of an API without embeddings keeps this default, which throws.
   *
   * @param {AiEmbedRequest} request - The model and the texts.
   * @param {AiCallOptions} [options] - The signal and the timeout of the call.
   * @return {Promise<AiEmbedResponse>} A vector per text.
   * @throws {AiError} `AI_CAPABILITY_UNSUPPORTED`.
   */
  public async embed(
    request: AiEmbedRequest,
    options?: AiCallOptions
  ): Promise<AiEmbedResponse> {
    throw new AiError(
      ErrorCode.AiCapabilityUnsupported,
      `The '${this.endpoint.driver}' driver of the '${this.endpoint.name}' endpoint has no embeddings`,
      {
        model: `${this.endpoint.name}:${request.model}`,
        capability: 'embeddings'
      }
    );
  }

  /**
   * Tells whether the models of the endpoint have a capability, from the `capabilities` of the endpoint or its preset.
   *
   * @param {AiCapability} capability - The capability.
   * @param {string} model - The model name on the endpoint.
   * @return {boolean} `true` when the model has it.
   */
  public supports(capability: AiCapability, model: string): boolean {
    return this.endpoint.capabilities.includes(capability);
  }
}
