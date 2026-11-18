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

/** An endpoint of the `ai.endpoints` config, completed with its preset and the `ai` defaults. */
export type AiEndpoint = {
  /** The name of the endpoint, the prefix of its model references */
  name: string;
  driver: string;
  capabilities: AiCapability[];
  headers: Record<string, string>;
  timeout: number;
  maxRetries: number;
  /** The driver options of the preset */
  options: Record<string, unknown>;
  preset?: string;
  baseUrl?: string;
  apiKey?: string;
};

/** The class of a driver, created once per endpoint using it. */
export type AiDriverClass = new (endpoint: AiEndpoint) => AiDriver;

/**
 * The driver of the endpoints speaking one API, provided by a module as an `AiDriver` provider named by the driver
 * name, i.e. `openai` of `@appweaver/openai`. It throws an `AiError` (`AI_RATE_LIMITED`, `AI_TIMEOUT` and
 * `AI_PROVIDER_UNAVAILABLE` for the errors another model may not have), and the reason of an aborted signal as it is.
 */
export abstract class AiDriver {
  constructor(public readonly endpoint: AiEndpoint) {}

  /** Sends a request and returns the whole response. */
  abstract generate(
    request: AiModelRequest,
    options?: AiCallOptions
  ): Promise<AiModelResponse>;

  /** Sends a request and streams the response, the tool calls whole, ending with a `finish` part. */
  abstract stream(
    request: AiModelRequest,
    options?: AiCallOptions
  ): AsyncIterable<AiStreamPart>;

  /** Checks that the endpoint answers, i.e. by listing its models. */
  abstract checkHealth(): Promise<HealthCheckResult>;

  /**
   * Embeds texts into vectors, which a driver of an API without embeddings leaves to this default.
   *
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

  /** Tells whether the models of the endpoint have a capability, from the endpoint or its preset. */
  public supports(capability: AiCapability, model: string): boolean {
    return this.endpoint.capabilities.includes(capability);
  }
}
