import { BaseClientInterface } from '../../clients/base-client-interface';

export type RecordedCall = {
  method: string;
  path: string;
  params: any;
};

export type StubClient = {
  client: BaseClientInterface;
  calls: RecordedCall[];
  lastCall: () => RecordedCall;
};

/**
 * Creates a {@link BaseClientInterface} stub that records every request made by
 * a module client and returns the configured response.
 */
export function createStubClient(
  result: { data?: any; error?: any; response?: Response } = {}
): StubClient {
  const calls: RecordedCall[] = [];

  const record = (method: string, path: string, params: any[]) => {
    calls.push({ method, path, params: params[0] });
  };

  const sendRequestPromise = async (
    method: string,
    path: string,
    ...params: any[]
  ) => {
    record(method, path, params);
    return result.data;
  };

  const sendRequestRawPromise = async (
    method: string,
    path: string,
    ...params: any[]
  ) => {
    record(method, path, params);
    return {
      data: result.data,
      error: result.error,
      response: result.response ?? new Response(null, { status: 200 })
    };
  };

  const client = {
    sendRequestPromise,
    sendRequestRawPromise,
    sendRequest: sendRequestPromise,
    sendRequestRaw: sendRequestRawPromise
  } as unknown as BaseClientInterface;

  return {
    client,
    calls,
    lastCall: () => calls[calls.length - 1]
  };
}
