import { Redis as RedisClient, ReplyError } from 'ioredis';
import { ErrorCode, MemoryError } from '@appweaver/common';
import { CircuitBreaker } from './circuit-breaker';

/**
 * Sends the commands of a ready client through the circuit breaker, and fails
 * the ones Redis did not answer with `MemoryUnavailable`. A client that is not
 * ready, i.e. reconnecting, bypasses the breaker.
 */
export function guardClient(
  client: RedisClient,
  breaker: CircuitBreaker
): RedisClient {
  const sendCommand = client.sendCommand.bind(client);

  client.sendCommand = (command, stream) => {
    const guarded = client.status === 'ready';

    if (guarded && !breaker.acquire()) {
      command.reject(
        unavailableError('Redis circuit breaker is open', breaker.remaining())
      );
      return command.promise;
    }

    const { resolve, reject } = command;
    command.resolve = (result) => {
      if (guarded) {
        breaker.success();
      }
      resolve(result);
    };
    command.reject = (error) => {
      // An error reply is an answer, so Redis is available
      if (error instanceof ReplyError) {
        if (guarded) {
          breaker.success();
        }
        reject(error);
        return;
      }
      if (guarded) {
        breaker.failure();
      }
      reject(unavailableError(error.message, breaker.remaining(), error));
    };

    return sendCommand(command, stream);
  };

  return client;
}

function unavailableError(
  message: string,
  remaining: number,
  cause?: Error
): MemoryError {
  return new MemoryError(
    ErrorCode.MemoryUnavailable,
    `Redis is unavailable: ${message}`,
    remaining > 0 ? { retryAfter: Math.ceil(remaining / 1000) } : {},
    { cause }
  );
}
