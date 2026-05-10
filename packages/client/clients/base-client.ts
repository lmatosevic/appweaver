import createClient, {
  Client,
  FetchResponse,
  MaybeOptionalInit,
  Middleware
} from 'openapi-fetch';
import {
  HttpMethod,
  MediaType,
  PathsWithMethod
} from 'openapi-typescript-helpers';
import {
  BaseClientInterface,
  ExtendedPaths,
  InitParam,
  ObservableMethods,
  ObservableOrPromise
} from './base-client-interface';
import {
  AccountClient,
  AccountInterface,
  AccountType,
  AuthClient,
  AuthInterface,
  AuthType,
  FilesClient,
  HealthClient,
  HealthInterface,
  HealthType,
  ResourceClient,
  ResourceInterface,
  ResourceType
} from './modules';
import { ClientError } from '../errors';

type ClientModules = {
  resources: ResourceClient<ResourceType>[];
  auth?: AuthClient<AuthType>;
  account?: AccountClient<AccountType>;
  health?: HealthClient<HealthType>;
  files?: FilesClient;
};

export type ClientResult<
  TClient,
  Interface,
  OmitFields extends readonly (keyof Interface)[]
> = [OmitFields[number]] extends [never]
  ? TClient
  : Omit<TClient, OmitFields[number]>;

export type ClientResultMethods<T, B extends boolean> = B extends true
  ? ObservableMethods<T>
  : T;

/**
 * Function type for dynamically resolving authentication values per request.
 *
 * This function receives the outgoing `Request` and can return authentication configuration
 * either synchronously or asynchronously. Used to provide dynamic auth values (e.g., fetching
 * tokens from storage) instead of static strings or objects.
 *
 * @typeParam T - The type of authentication value to return (string, JwtAuthConfig, ApiKeyAuthConfig, or
 * BasicAuthConfig).
 * @param {Request} req - The outgoing HTTP request object.
 * @returns The authentication value, either directly or wrapped in a Promise.
 */
export type AuthFn<T> = (req: Request) => T | Promise<T>;

/** Configuration for JWT-based authentication. */
export type JwtAuthConfig = {
  /** The JWT access token to include in the `Authorization: Bearer` header. */
  accessToken: string;
  /** Optional refresh token for renewing expired access tokens when calling the refresh endpoint. */
  refreshToken?: string;
};

/** Configuration for API key authentication. */
export type ApiKeyAuthConfig = {
  /** The API key value to send in the request header. */
  key: string;
  /** The header name to use for the API key. Defaults to `X-Api-Key`. */
  header?: string;
};

/** Configuration for HTTP Basic authentication. */
export type BasicAuthConfig = {
  /** The username for Basic authentication. */
  username: string;
  /** The password for Basic authentication. */
  password: string;
};

/**
 * Authentication configuration for the client. Exactly one auth strategy must be provided.
 *
 * - `jwt` — attaches a `Bearer` token to the `Authorization` header.
 * - `apiKey` — attaches a key to a configurable header (default: `X-Api-Key`).
 * - `basic` — attaches Base64-encoded credentials to the `Authorization` header.
 *
 * Each value may be a static config object, a plain string shorthand, or an async function
 * that receives the outgoing `Request` and returns the auth value dynamically.
 */
export type AuthConfig =
  | {
      jwt: string | AuthFn<string> | AuthFn<JwtAuthConfig> | JwtAuthConfig;
    }
  | {
      apiKey:
        | string
        | AuthFn<string>
        | AuthFn<ApiKeyAuthConfig>
        | ApiKeyAuthConfig;
    }
  | {
      basic:
        | string
        | AuthFn<string>
        | AuthFn<BasicAuthConfig>
        | BasicAuthConfig;
    };

/**
 * Type definition for a custom fetch handler implementation.
 *
 * This type represents a function that performs HTTP requests and returns a Promise resolving to a Response object.
 * It is intended to be used as a replacement or extension of the default `fetch` function provided by the browser or
 * other runtime environments.
 *
 * @param {RequestInfo} request - The resource that you wish to fetch, either as a string URL or a Request object.
 * @param {RequestInit} [init] - Optional options object containing custom settings for the fetch request, such as
 * method, headers, body, and more.
 * @returns {Promise<Response>} A Promise that resolves to the Response to the request.
 */
export type FetchHandler = (
  request: RequestInfo,
  init?: RequestInit
) => Promise<Response>;

/** Configuration options for {@link FetchClient}. */
export type ClientConfig = {
  /** The base URL that will be prepended to every request path. */
  baseUrl: string;
  /** Request timeout in milliseconds. Requests that exceed this duration are aborted. */
  timeout?: number;
  /** Additional `openapi-fetch` middlewares applied after the built-in timeout and auth middlewares. */
  middlewares?: Middleware[];
  /** Authentication strategy to attach to every outgoing request. */
  auth?: AuthConfig;
  /** Custom fetch handler implementation for making HTTP requests and transforming responses. */
  fetch?: FetchHandler;
};

/**
 * Type-safe HTTP client built on top of `openapi-fetch`.
 *
 * `BaseClient` wires up a base URL, optional request timeout, optional authentication
 * middleware, and any additional custom middlewares into a single reusable client instance.
 * Subclasses expose domain-specific helpers by composing the protected factory methods
 * (`resourceClient`, `authClient`, `accountClient`, `healthClient`, `fileClient`).
 *
 * @typeParam Paths - The OpenAPI path map generated by `openapi-typescript` for the target API.
 * @typeParam UseObservable - Boolean flag indicating whether to return Observables (true) or Promises (false).
 * Defaults to false for Promise-based clients like `FetchClient`. Set to true in `AngularClient` to enable RxJS
 * Observable support.
 */
export abstract class BaseClient<
  Paths extends {} = { [key: string]: any },
  UseObservable extends boolean = false
> implements BaseClientInterface<Paths, UseObservable> {
  private readonly _client: Client<Paths>;
  private readonly _modules: ClientModules = {
    resources: []
  };

  protected constructor(private readonly _config: ClientConfig) {
    const { baseUrl, timeout, middlewares, auth } = _config;

    this._client = createClient<Paths>({ baseUrl });

    if (timeout) {
      this._client.use({
        onRequest: async ({ request }) => {
          const timeoutSignal = AbortSignal.timeout(timeout);

          return new Request(request, {
            signal: request.signal
              ? AbortSignal.any([request.signal, timeoutSignal])
              : timeoutSignal
          });
        }
      });
    }

    if (auth) {
      this._client.use({
        onRequest: async ({ request, schemaPath }) => {
          const headers = new Headers(request.headers);

          if ('jwt' in auth) {
            const jwt =
              typeof auth.jwt === 'function'
                ? await auth.jwt(request)
                : auth.jwt;
            let token: string | undefined;
            if (typeof jwt === 'object') {
              token = jwt.accessToken;
              const refreshPath =
                `/${this._modules.auth?.basePath}/refresh`.replace(/\/+/g, '/');
              if (schemaPath === refreshPath && jwt.refreshToken) {
                token = jwt.refreshToken;
              }
            } else {
              token = jwt;
            }
            headers.set('Authorization', `Bearer ${token}`);
          } else if ('basic' in auth) {
            const basic =
              typeof auth.basic === 'function'
                ? await auth.basic(request)
                : auth.basic;
            const secret =
              typeof basic === 'string'
                ? basic
                : btoa(`${basic.username}:${basic.password}`);
            headers.set('Authorization', `Basic ${secret}`);
          }

          if ('apiKey' in auth) {
            const apiKey =
              typeof auth.apiKey === 'function'
                ? await auth.apiKey(request)
                : auth.apiKey;
            const key = typeof apiKey === 'string' ? apiKey : apiKey.key;
            const header =
              typeof apiKey !== 'string' ? apiKey?.header : undefined;
            headers.set(header ?? 'X-Api-Key', key);
          }

          return new Request(request, {
            headers
          });
        }
      });
    }

    if (middlewares) {
      for (const middleware of middlewares) {
        this._client.use(middleware);
      }
    }
  }

  /**
   * Returns the underlying `openapi-fetch` client instance.
   *
   * Use this when direct access to the raw client is required to call methods
   * not exposed by `FetchClient` directly.
   */
  public getClient(): Client<Paths> {
    return this._client;
  }

  /**
   * Retrieves the client configuration.
   *
   * @return {ClientConfig} The current client configuration instance.
   */
  public getConfig(): ClientConfig {
    return this._config;
  }

  /**
   * Sends an HTTP request and returns the parsed response data.
   *
   * Returns a `Promise` by default. In `AngularClient` (where `UseObservable = true`)
   * this method is overridden to return an `Observable` instead.
   *
   * Throws a {@link ClientError} if the server returns an error response, including the
   * error message and status code from the response body when available.
   *
   * @typeParam Method - The HTTP method (e.g. `"get"`, `"post"`).
   * @typeParam Path - A path in `Paths` that supports `Method`.
   * @typeParam Init - The request init inferred from the OpenAPI schema for this operation.
   * @param {HttpMethod} method - The HTTP method to use.
   * @param {string} url - The API path to request.
   * @param {Object} params - Optional request parameters (body, query, headers, etc.) as defined by the schema.
   * @returns The non-nullable `data` field from the response.
   * @throws {ClientError} When the server returns an error response.
   */
  public sendRequest<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): ObservableOrPromise<
    NonNullable<
      FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>['data']
    >,
    UseObservable
  > {
    return this.sendRequestPromise(method, url, ...(params as any)) as any;
  }

  /**
   * Sends an HTTP request and returns the raw `openapi-fetch` response tuple.
   *
   * Returns a `Promise` by default. In `AngularClient` (where `UseObservable = true`)
   * this method is overridden to return an `Observable` instead.
   *
   * Unlike {@link sendRequest}, this method does **not** throw on error responses — callers
   * receive the full `{ data, error, response }` object and are responsible for handling
   * error cases themselves.
   *
   * @typeParam Method - The HTTP method (e.g. `"get"`, `"post"`).
   * @typeParam Path - A path in `Paths` that supports `Method`.
   * @typeParam Init - The request init inferred from the OpenAPI schema for this operation.
   * @param {HttpMethod} method - The HTTP method to use.
   * @param {string} url - The API path to request.
   * @param {Object} params - Optional request parameters (body, query, headers, etc.) as defined by the schema.
   * @returns The raw `FetchResponse` containing `data`, `error`, and the native `Response`.
   */
  public sendRequestRaw<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): ObservableOrPromise<
    FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>,
    UseObservable
  > {
    return this.sendRequestRawPromise(method, url, ...(params as any)) as any;
  }

  /**
   * Sends an HTTP request and returns the parsed response data as a Promise.
   *
   * This protected helper always returns a `Promise` and is intended to be called
   * by {@link sendRequest} and overrides in subclasses such as `AngularClient`.
   *
   * @throws {ClientError} When the server returns an error response.
   */
  public async sendRequestPromise<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): Promise<
    NonNullable<
      FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>['data']
    >
  > {
    const { data, error, response } = await this._client.request(
      method,
      url,
      ...(params as any)
    );

    if (error) {
      const err = error as { message?: string; errorCode?: number };
      throw new ClientError(
        err.message ?? response.statusText ?? 'Unknown error',
        err.errorCode ?? response.status,
        response,
        error
      );
    }

    return data!;
  }

  /**
   * Sends an HTTP request and returns the raw `openapi-fetch` response tuple as a Promise.
   *
   * This protected helper always returns a `Promise` and is intended to be called
   * by {@link sendRequestRaw} and overrides in subclasses such as `AngularClient`.
   */
  public sendRequestRawPromise<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): Promise<
    FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>
  > {
    return this._client.request(method, url, ...(params as any));
  }

  /**
   * Handles a custom HTTP request based on the provided method, URL, and initialization parameters.
   *
   * @param {Method} method - The HTTP method to be used (e.g., GET, POST).
   * @param {Path} url - The endpoint URL corresponding to the specified method.
   * @return A function that accepts initialization parameters and returns an observable or promise of the fetched data.
   */
  protected customRequest<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path
  ): (
    ...params: InitParam<Init>
  ) => ObservableOrPromise<
    NonNullable<
      FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>['data']
    >,
    UseObservable
  > {
    return (...params: InitParam<Init>) => {
      return this.sendRequest<Method, Path, Init>(
        method,
        url,
        ...params
      ) as any;
    };
  }

  /**
   * Creates and returns a new instance of a ResourceClient for managing a specific resource type.
   *
   * @param {string} resourcePath - The API path or endpoint for the resource.
   * @template Resource - The type of the resource being managed.
   * @template OmitFields - An optional array of resource interface fields to omit.
   * @return {ResourceClient} A ResourceClient instance for interacting with the specified resource.
   */
  protected resourceClient<
    Resource extends ResourceType,
    OmitFields extends readonly (keyof ResourceInterface)[] = []
  >(
    resourcePath: string
  ): ClientResultMethods<
    ClientResult<ResourceClient<Resource>, ResourceInterface, OmitFields>,
    UseObservable
  > {
    const resource = new ResourceClient<Resource>(this as any, resourcePath);
    this._modules.resources.push(resource);
    return resource as any;
  }

  /**
   * Creates and returns an AuthClient instance for managing authentication operations.
   *
   * @param {string} authPath - The authentication path used to configure the AuthClient instance.
   * @return {AuthClient} An instance of AuthClient initialized with the provided authentication path.
   */
  protected authClient<
    Auth extends AuthType,
    OmitFields extends readonly (keyof AuthInterface)[] = []
  >(
    authPath: string
  ): ClientResultMethods<
    ClientResult<AuthClient<Auth>, AuthInterface, OmitFields>,
    UseObservable
  > {
    const auth = new AuthClient<Auth>(this as any, authPath);
    this._modules.auth = auth;
    return auth as any;
  }

  /**
   * Creates and returns an AccountClient instance for managing account-related operations.
   *
   * @param {string} accountPath - The path to the account resource.
   * @return {AccountClient} An instance of AccountClient configured with the provided account path.
   */
  protected accountClient<
    Account extends AccountType,
    OmitFields extends readonly (keyof AccountInterface)[] = []
  >(
    accountPath: string
  ): ClientResultMethods<
    ClientResult<AccountClient<Account>, AccountInterface, OmitFields>,
    UseObservable
  > {
    const account = new AccountClient<Account>(this as any, accountPath);
    this._modules.account = account;
    return account as any;
  }

  /**
   * Creates and returns a HealthClient instance for interacting with health-related data.
   *
   * @param {string} healthPath - The path to the health resource endpoint.
   * @return {HealthClient} An instance of HealthClient configured with the provided health path.
   */
  protected healthClient<
    Health extends HealthType,
    OmitFields extends readonly (keyof HealthInterface)[] = []
  >(
    healthPath: string
  ): ClientResultMethods<
    ClientResult<HealthClient<Health>, HealthInterface, OmitFields>,
    UseObservable
  > {
    const health = new HealthClient<Health>(this as any, healthPath);
    this._modules.health = health;
    return health as any;
  }

  /**
   * Creates and returns an instance of `FilesClient` for the specified file path.
   *
   * @param {string} filesPath - The file path used to initialize the `FilesClient`.
   * @return {FilesClient} An instance of FilesClient configured with the provided files' path.
   */
  protected filesClient<
    OmitFields extends readonly (keyof HealthInterface)[] = []
  >(
    filesPath: string
  ): ClientResultMethods<
    ClientResult<FilesClient, HealthInterface, OmitFields>,
    UseObservable
  > {
    const files = new FilesClient(this as any, filesPath);
    this._modules.files = files;
    return files as any;
  }
}
