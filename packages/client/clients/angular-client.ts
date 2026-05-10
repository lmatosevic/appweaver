import { FetchResponse, MaybeOptionalInit } from 'openapi-fetch';
import {
  HttpMethod,
  MediaType,
  PathsWithMethod
} from 'openapi-typescript-helpers';
import { from, Observable } from 'rxjs';
import {
  BaseClient,
  ClientConfig,
  ClientResult,
  FetchHandler
} from './base-client';
import {
  ExtendedPaths,
  InitParam,
  ObservableMethods
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

export class AngularClient<
  Paths extends {} = { [key: string]: any }
> extends BaseClient<Paths, true> {
  constructor(fetch: FetchHandler, config: ClientConfig) {
    super({ ...config, fetch });
  }

  public override sendRequest<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): Observable<
    NonNullable<
      FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>['data']
    >
  > {
    return from(
      super.sendRequestPromise<Method, Path, Init>(method, url, ...params)
    );
  }

  public override sendRequestRaw<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path,
    ...params: InitParam<Init>
  ): Observable<
    FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>
  > {
    return from(
      super.sendRequestRawPromise<Method, Path, Init>(method, url, ...params)
    );
  }

  protected override customRequest<
    Method extends HttpMethod,
    Path extends PathsWithMethod<Paths, Method>,
    Init extends MaybeOptionalInit<ExtendedPaths<Paths>[Path], Method>
  >(
    method: Method,
    url: Path
  ): (
    ...params: InitParam<Init>
  ) => Observable<
    NonNullable<
      FetchResponse<ExtendedPaths<Paths>[Path][Method], Init, MediaType>['data']
    >
  > {
    return (...params: InitParam<Init>) =>
      from(
        super.sendRequestPromise<Method, Path, Init>(method, url, ...params)
      );
  }

  protected resourceClient<
    Resource extends ResourceType,
    OmitFields extends readonly (keyof ResourceInterface)[] = []
  >(
    resourcePath: string
  ): ObservableMethods<
    ClientResult<ResourceClient<Resource>, ResourceInterface, OmitFields>
  > {
    const instance = super.resourceClient<Resource, OmitFields>(resourcePath);
    return this.wrapWithObservables(instance);
  }

  protected authClient<
    Auth extends AuthType,
    OmitFields extends readonly (keyof AuthInterface)[] = []
  >(
    authPath: string
  ): ObservableMethods<
    ClientResult<AuthClient<Auth>, AuthInterface, OmitFields>
  > {
    const instance = super.authClient<Auth, OmitFields>(authPath);
    return this.wrapWithObservables(instance);
  }

  protected accountClient<
    Account extends AccountType,
    OmitFields extends readonly (keyof AccountInterface)[] = []
  >(
    accountPath: string
  ): ObservableMethods<
    ClientResult<AccountClient<Account>, AccountInterface, OmitFields>
  > {
    const instance = super.accountClient<Account, OmitFields>(accountPath);
    return this.wrapWithObservables(instance);
  }

  protected healthClient<
    Health extends HealthType,
    OmitFields extends readonly (keyof HealthInterface)[] = []
  >(
    healthPath: string
  ): ObservableMethods<
    ClientResult<HealthClient<Health>, HealthInterface, OmitFields>
  > {
    const instance = super.healthClient<Health, OmitFields>(healthPath);
    return this.wrapWithObservables(instance);
  }

  protected filesClient<
    OmitFields extends readonly (keyof HealthInterface)[] = []
  >(
    filesPath: string
  ): ObservableMethods<ClientResult<FilesClient, HealthInterface, OmitFields>> {
    const instance = super.filesClient<OmitFields>(filesPath);
    return this.wrapWithObservables(instance);
  }

  private wrapWithObservables<T extends object>(instance: T): T {
    const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as any).then === 'function';

    return new Proxy(instance, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          return isPromiseLike(result) ? from(result) : result;
        };
      }
    });
  }
}
