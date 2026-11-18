import {
  DURATION_BUCKETS,
  recordDuration,
  spanErrorType,
  SpanKind,
  telemetryEnabled,
  telemetryHistogram,
  withSpan
} from '@appweaver/common';

const operationDuration = telemetryHistogram('mcp.server.operation.duration', {
  description: 'The duration of the MCP tool calls',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS }
});

/**
 * Runs a tool call in its server span (`tools/call <tool>`), recording its duration.
 *
 * @param {string} tool - The name of the tool.
 * @param {Function} fn - Calls the tool.
 * @return {Promise} The value of the tool.
 */
export async function traceToolCall<T>(
  tool: string,
  fn: () => T | Promise<T>
): Promise<T> {
  if (!telemetryEnabled('mcp')) {
    return fn();
  }
  const started = performance.now();
  const attributes = {
    'mcp.method.name': 'tools/call',
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.tool.name': tool
  };
  try {
    const value = await withSpan(
      `tools/call ${tool}`,
      { kind: SpanKind.SERVER, attributes },
      () => fn()
    );
    recordDuration(operationDuration(), started, attributes);
    return value;
  } catch (error) {
    recordDuration(operationDuration(), started, {
      ...attributes,
      'error.type': spanErrorType(error)
    });
    throw error;
  }
}
