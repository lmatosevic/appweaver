import {
  DURATION_BUCKETS,
  failSpan,
  recordDuration,
  runInTraceContext,
  Span,
  SpanKind,
  spanErrorType,
  startSpan,
  telemetryEnabled,
  telemetryHistogram,
  TraceContext,
  withSpan
} from '@appweaver/common';
import { AiEndpoint } from '../driver/ai-driver';
import { AiModelRequest, AiModelResponse, AiToolCall, AiUsage } from '../types';

const tokenUsage = telemetryHistogram('gen_ai.client.token.usage', {
  description: 'The tokens of the AI model calls, by their type',
  unit: '{token}',
  advice: {
    explicitBucketBoundaries: [
      1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576
    ]
  }
});

const operationDuration = telemetryHistogram(
  'gen_ai.client.operation.duration',
  {
    description: 'The duration of the AI model calls',
    unit: 's',
    advice: { explicitBucketBoundaries: DURATION_BUCKETS }
  }
);

/** The operation of a model call, as the semantic conventions of generative AI name it. */
export type AiOperation = 'chat' | 'embeddings';

/** A model call being traced, ended with its response or its error. */
export type AiCallTrace = {
  /** The span of the call, undefined while the `ai` instrumentation is off */
  span?: Span;
  /** The context holding the span */
  context?: TraceContext;
  /** Runs a function in the context of the span, so the spans it starts (the HTTP request) are its children. */
  run<T>(fn: () => T): T;
  /** Ends the span and records the metrics of the response. */
  end(
    response?: Pick<AiModelResponse, 'id' | 'model' | 'finishReason'> & {
      usage?: Partial<AiUsage>;
    }
  ): void;
  /** Ends the span with an error. */
  fail(error: unknown): void;
};

/**
 * Starts the span of a model call (`chat qwen3:8b`), with the attributes of the semantic conventions of generative
 * AI, and records its duration and tokens once it ends.
 *
 * @param {AiOperation} operation - The operation.
 * @param {AiEndpoint} endpoint - The endpoint called.
 * @param {Partial<AiModelRequest>} request - The model and the parameters of the request.
 * @return {AiCallTrace} The trace of the call.
 */
export function traceAiCall(
  operation: AiOperation,
  endpoint: AiEndpoint,
  request: Pick<AiModelRequest, 'model'> & Partial<AiModelRequest>
): AiCallTrace {
  if (!telemetryEnabled('ai')) {
    return { run: (fn) => fn(), end: () => {}, fail: () => {} };
  }

  const started = performance.now();
  const attributes = {
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': endpoint.preset ?? endpoint.driver,
    'gen_ai.request.model': request.model,
    'appweaver.ai.endpoint': endpoint.name,
    ...serverAttributes(endpoint.baseUrl),
    ...definedAttributes({
      'gen_ai.request.max_tokens': request.maxTokens,
      'gen_ai.request.temperature': request.temperature,
      'gen_ai.request.top_p': request.topP,
      'gen_ai.request.seed': request.seed
    })
  };
  const { span, context } = startSpan(`${operation} ${request.model}`, {
    kind: SpanKind.CLIENT,
    attributes
  });
  const metricAttributes = {
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': attributes['gen_ai.provider.name'],
    'gen_ai.request.model': request.model
  };

  return {
    span,
    context,
    run: (fn) => runInTraceContext(context, fn),
    end: (response) => {
      const responseModel = response?.model ?? request.model;
      span.setAttributes(
        definedAttributes({
          'gen_ai.response.id': response?.id,
          'gen_ai.response.model': responseModel,
          'gen_ai.response.finish_reasons': response?.finishReason
            ? [response.finishReason]
            : undefined,
          'gen_ai.usage.input_tokens': response?.usage?.inputTokens,
          'gen_ai.usage.output_tokens': response?.usage?.outputTokens
        })
      );
      span.end();
      const measured = {
        ...metricAttributes,
        'gen_ai.response.model': responseModel
      };
      recordDuration(operationDuration(), started, measured);
      for (const [type, tokens] of [
        ['input', response?.usage?.inputTokens],
        ['output', response?.usage?.outputTokens]
      ] as const) {
        if (tokens !== undefined) {
          tokenUsage().record(tokens, {
            ...measured,
            'gen_ai.token.type': type
          });
        }
      }
    },
    fail: (error) => {
      failSpan(span, error);
      span.end();
      recordDuration(operationDuration(), started, {
        ...metricAttributes,
        'error.type': spanErrorType(error)
      });
    }
  };
}

/**
 * Runs a tool in the span of its execution (`execute_tool getWeather`).
 *
 * @param {AiToolCall} toolCall - The call of the model.
 * @param {Function} fn - Runs the tool.
 * @return {Promise} The result of the tool.
 */
export function traceToolCall<T>(
  toolCall: AiToolCall,
  fn: () => Promise<T>
): Promise<T> {
  if (!telemetryEnabled('ai')) {
    return fn();
  }
  return withSpan(
    `execute_tool ${toolCall.name}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': toolCall.name,
        'gen_ai.tool.call.id': toolCall.id
      }
    },
    fn
  );
}

function serverAttributes(baseUrl?: string): Record<string, string | number> {
  if (!baseUrl) {
    return {};
  }
  try {
    const url = new URL(baseUrl);
    return {
      'server.address': url.hostname,
      ...(url.port ? { 'server.port': Number(url.port) } : {})
    };
  } catch {
    return {};
  }
}

function definedAttributes<T extends Record<string, unknown>>(
  attributes: T
): Record<string, string | number | string[]> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | string[]>;
}
