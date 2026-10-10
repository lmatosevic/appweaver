/** A single invalid field of a rejected request. */
export type ClientFieldError = {
  /** The dot notation path of the field, i.e. `author.email`. */
  field: string;
  /** The rule the field failed, i.e. `required`, `unique` or `maxLength`. */
  rule: string;
  /** The human-readable description of the failure. */
  message: string;
  /** The JSON pointer to the field in the request, i.e. `#/body/email`. */
  pointer?: string;
};

/** The RFC 9457 problem details of an error response of an Appweaver API. */
export type ClientProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  requestId?: string;
  errors?: ClientFieldError[];
  details?: Record<string, unknown>;
};

/** The code of an error response that carries no problem details. */
export const REQUEST_FAILED_CODE = 'REQUEST_FAILED';

/** The route of the request an error response answered, its path as the
 * OpenAPI document declares it, i.e. `/api/posts/{id}`. */
export type ClientErrorRoute = { method: string; path: string };

/** The options of a {@link ClientError}. */
export type ClientErrorOptions = {
  /** The HTTP status code of the response. */
  status: number;
  /** The error response. */
  response?: Response;
  /** The parsed body of the error response, its problem details. */
  data?: unknown;
  /** The route of the request the response answered. */
  route?: ClientErrorRoute;
};

/** The content type of the problem details of an error response. */
type ProblemContentType = 'application/problem+json';

/** The error code of a response, never for a response with no problem details. */
type ResponseErrorCode<R> = R extends {
  content: { [K in ProblemContentType]: { code: infer C } };
}
  ? C
  : never;

/**
 * The error codes a route of an API can respond with, read from the problem
 * details of its error responses, i.e.
 * `ClientRouteErrorCode<paths, 'get', '/api/posts/{id}'>`.
 */
export type ClientRouteErrorCode<
  Paths,
  Method extends string,
  Path extends keyof Paths
> = Paths[Path] extends { [K in Method]: { responses: infer R } }
  ? Extract<{ [S in keyof R]: ResponseErrorCode<R[S]> }[keyof R], string>
  : never;

/**
 * An error response of the API. The `code` identifies the error case, i.e.
 * `RESOURCE_NOT_FOUND`, and can be compared with the generated `ErrorCode`.
 * Narrow a caught error with the generated `isApiError` or with
 * `client.isRouteError` to type its `code`, which `instanceof` types as `any`.
 *
 * @example
 * try {
 *   await client.user.create(data);
 * } catch (e) {
 *   if (isApiError(e) && e.is(ErrorCode.DatabaseUniqueViolation)) {
 *     showFieldErrors(e.errors);
 *   }
 * }
 */
export class ClientError<C extends string = string> extends Error {
  public readonly status: number;
  public readonly code: C;
  public readonly problem: ClientProblem | undefined;
  public readonly response: Response | undefined;
  public readonly data: any;
  public readonly route: ClientErrorRoute | undefined;

  constructor(message: string, options: ClientErrorOptions) {
    super(message);
    this.name = 'ClientError';
    this.status = options.status;
    this.response = options.response;
    this.data = options.data;
    this.route = options.route;
    this.problem = isProblem(options.data) ? options.data : undefined;
    this.code = (this.problem?.code ?? REQUEST_FAILED_CODE) as C;
  }

  /**
   * Creates the error of a response, reading its message and code from the
   * problem details it carries.
   *
   * @param {unknown} data The parsed body of the error response.
   * @param {Response} response The error response.
   * @param {ClientErrorRoute} [route] The route of the request.
   */
  public static fromResponse(
    data: unknown,
    response: Response,
    route?: ClientErrorRoute
  ): ClientError {
    const body = data as { detail?: string; message?: string } | undefined;
    return new ClientError(
      body?.detail ?? body?.message ?? (response.statusText || 'Unknown error'),
      {
        status: response.status,
        response,
        data,
        route: route && {
          method: route.method.toLowerCase(),
          path: route.path
        }
      }
    );
  }

  /** The invalid fields of the request, empty when none are reported. */
  public get errors(): ClientFieldError[] {
    return this.problem?.errors ?? [];
  }

  /** The details of the error, specific to its code. */
  public get details(): Record<string, unknown> {
    return this.problem?.details ?? {};
  }

  /** Checks whether the error has the given code. */
  public is<K extends C>(code: K): this is ClientError<K> {
    return (this.code as string) === code;
  }
}

/**
 * Checks whether an error is a {@link ClientError}, typing its `code` as one of
 * the given codes. A plain `instanceof` check types it as `any`, since it
 * cannot know the codes. The generated client binds it to the `ErrorCode` of
 * its API as `isApiError`.
 */
export function isClientError<C extends string = string>(
  error: unknown
): error is ClientError<C> {
  return error instanceof ClientError;
}

function isProblem(data: unknown): data is ClientProblem {
  const problem = data as Partial<ClientProblem> | null;
  return (
    typeof problem === 'object' &&
    problem !== null &&
    typeof problem.code === 'string' &&
    typeof problem.status === 'number'
  );
}
