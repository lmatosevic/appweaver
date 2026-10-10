# Errors

Appweaver separates the errors of the framework from their HTTP representation. The services, utilities, queues,
schedulers and every other part of the code throw an `AppweaverError`, which carries a stable `code` and the `details`
of the error but no HTTP status, so the same service behaves the same whether a route, a queue worker, a scheduled job
or a script calls it. Only the API layer maps the code to an HTTP status and responds with the
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details of the error.

## Error response

Every error response has the `application/problem+json` content type and the same shape, so a client tells the error
cases apart by their `code` instead of parsing messages:

```json
{
  "type": "urn:appweaver:error:database-unique-violation",
  "title": "Unique constraint violation",
  "status": 409,
  "code": "DATABASE_UNIQUE_VIOLATION",
  "detail": "User with the same email already exists",
  "instance": "/api/users",
  "requestId": "req-3f",
  "errors": [
    {
      "field": "email",
      "rule": "unique",
      "message": "must be unique"
    }
  ],
  "details": {
    "model": "User",
    "fields": [
      "email"
    ]
  }
}
```

| Member      | Description                                                                                                   |
|-------------|---------------------------------------------------------------------------------------------------------------|
| `type`      | URI of the problem type, the `APP_TYPE_BASE` config (`urn:appweaver`), `error` and the kebab-case code |
| `title`     | Short summary of the error code, the same for every occurrence                                                |
| `status`    | HTTP status code of the response                                                                              |
| `code`      | The `ErrorCode` value (from `@appweaver/common`) or the code of an application error                          |
| `detail`    | Explanation of this occurrence of the error                                                                   |
| `instance`  | Path of the request, without the query string                                                                 |
| `requestId` | Id of the request, matching the `reqId` of the server logs                                                    |
| `errors`    | Invalid fields of the request (`field`, `rule`, `message`, optional JSON `pointer`), when the error has them  |
| `details`   | Details specific to the error code, i.e. the `fields` of a constraint violation or the `maxCount` of files    |

- A request failing the schema validation responds with `VALIDATION_FAILED` and an entry of `errors` per invalid field,
  i.e.
  `{ "field": "author.email", "rule": "format", "message": "must match format \"email\"", "pointer": "#/body/author/email" }`.
- A database constraint violation responds with a `DATABASE_*` code naming the violated fields, both in `details.fields`
  and in `errors`: unique (`409`), foreign key (`409`), not null, value too long, value out of range and invalid value
  (`400`).
- The `detail` of a database error is the framework message only, i.e. "User with the same email already exists".
  Set `SERVER_ERROR_DATABASE_MESSAGE_ENABLED` to append the message of the database in parentheses, in every
  environment, i.e. "(Unique constraint failed on the fields: (email))", without the query and code frame of the
  Prisma error. Outside production the `detail` of any other error is followed by the message of its cause.
- In production a 5xx response leaves out the `details`, and the `detail` of an unknown error is its title only.
- A response that already set a content type other than JSON, i.e. a file stream, receives the `detail` as plain text.
- A request matching no route responds with `ROUTE_NOT_FOUND`, and a rate limited one with `RATE_LIMITED` and the
  seconds to wait in `details.retryAfter`.
- The errors of Fastify and its plugins are converted into the class of their code, i.e. a too large upload into a
  `FileError` with `FILE_TOO_LARGE`.
- The 5xx errors are logged with their whole `cause` chain, the 4xx ones are not logged.

## Error classes

Every class extends the abstract `AppweaverError` of `@appweaver/common` and accepts only the codes of its module, by
their prefix:

| Class                | Package             | Codes            | Raised by                                                       |
|----------------------|---------------------|------------------|-----------------------------------------------------------------|
| `RequestError`       | `@appweaver/common` | request codes    | The API layer, or the application for a rejected request        |
| `ConfigurationError` | `@appweaver/common` | `CONFIGURATION_` | Invalid configuration and model definitions                     |
| `ApplicationError`   | `@appweaver/common` | any              | The application, with its own codes (see below)                 |
| `ContextError`       | `@appweaver/core`   | `CONTEXT_`       | The dependency injection container                              |
| `DatabaseError`      | `@appweaver/core`   | `DATABASE_`      | The database operations, translated from the Prisma errors      |
| `ResourceError`      | `@appweaver/core`   | `RESOURCE_`      | The resource services and their query, sort and relation inputs |
| `AuthError`          | `@appweaver/core`   | `AUTH_`          | The authentication and authorization                            |
| `AccountError`       | `@appweaver/core`   | `ACCOUNT_`       | The account service (email verification, password reset, 2FA)   |
| `OAuth2Error`        | `@appweaver/core`   | `OAUTH2_`        | The OAuth2 sign-in                                              |
| `RecaptchaError`     | `@appweaver/core`   | `RECAPTCHA_`     | The reCAPTCHA verification                                      |
| `FileError`          | `@appweaver/core`   | `FILE_`          | The file service and storage                                    |
| `ExportError`        | `@appweaver/core`   | `EXPORT_`        | The data export                                                 |
| `QueueError`         | `@appweaver/core`   | `QUEUE_`         | The queues                                                      |
| `MailerError`        | `@appweaver/core`   | `MAILER_`        | The email service, wrapping the error of the mailer             |
| `LockError`          | `@appweaver/core`   | `LOCK_`          | A lock that could not be acquired                               |

```ts
import { ErrorCode } from '@appweaver/common';
import { ResourceError } from '@appweaver/core';

throw new ResourceError(ErrorCode.ResourceNotFound, 'Order not found', { model: 'Order', id });
```

The constructor takes the code, the message, the `details` (typed per code by `ErrorDetailsMap`, optional for the codes
that require none) and the standard `ErrorOptions`, whose `cause` keeps the error it wraps. `error.is(code)` checks the
code and narrows the details, `isAppweaverError(error)` recognizes an error of any copy of the package, and
`JSON.stringify(error)` writes its `name`, `code`, `module`, `message`, `details` and the message of its `cause`.

## Error codes

The `ErrorCode` enum of `@appweaver/common` lists every code the framework raises, mapped to its HTTP status by
`errorHttpMap` of `@appweaver/core`:

| Code                                 | Status | Title                                 |
|--------------------------------------|--------|---------------------------------------|
| `INTERNAL_ERROR`                     | 500    | Internal server error                 |
| `VALIDATION_FAILED`                  | 400    | Validation failed                     |
| `MALFORMED_REQUEST`                  | 400    | Malformed request                     |
| `UNSUPPORTED_MEDIA_TYPE`             | 415    | Unsupported media type                |
| `PAYLOAD_TOO_LARGE`                  | 413    | Payload too large                     |
| `ROUTE_NOT_FOUND`                    | 404    | Route not found                       |
| `RATE_LIMITED`                       | 429    | Too many requests                     |
| `REQUEST_FAILED`                     | 400    | Request failed                        |
| `CONFIGURATION_INVALID`              | 500    | Invalid configuration                 |
| `CONTEXT_DEFINITION_MISSING`         | 500    | Missing context definition            |
| `CONTEXT_DEFINITION_DUPLICATE`       | 500    | Duplicate context definition          |
| `CONTEXT_SERVER_UNAVAILABLE`         | 500    | Server unavailable                    |
| `DATABASE_UNIQUE_VIOLATION`          | 409    | Unique constraint violation           |
| `DATABASE_FOREIGN_KEY_VIOLATION`     | 409    | Relation constraint violation         |
| `DATABASE_NULL_VIOLATION`            | 400    | Required field missing                |
| `DATABASE_VALUE_TOO_LONG`            | 400    | Value too long                        |
| `DATABASE_VALUE_OUT_OF_RANGE`        | 400    | Value out of range                    |
| `DATABASE_INVALID_VALUE`             | 400    | Invalid value                         |
| `DATABASE_RECORD_NOT_FOUND`          | 404    | Record not found                      |
| `DATABASE_WRITE_CONFLICT`            | 409    | Write conflict                        |
| `DATABASE_INVALID_TRANSACTION`       | 500    | Invalid transaction                   |
| `DATABASE_UNAVAILABLE`               | 503    | Database unavailable                  |
| `DATABASE_OPERATION_FAILED`          | 500    | Database operation failed             |
| `RESOURCE_NOT_FOUND`                 | 404    | Resource not found                    |
| `RESOURCE_FORBIDDEN`                 | 403    | Resource access forbidden             |
| `RESOURCE_INVALID_SORT`              | 400    | Invalid sort                          |
| `RESOURCE_INVALID_AGGREGATE`         | 400    | Invalid aggregation                   |
| `RESOURCE_INVALID_CURSOR`            | 400    | Invalid pagination cursor             |
| `RESOURCE_INVALID_QUERY_PARAMETER`   | 400    | Invalid query parameter               |
| `RESOURCE_INVALID_RELATION`          | 400    | Invalid relation                      |
| `RESOURCE_DELETE_RESTRICTED`         | 409    | Delete restricted                     |
| `AUTH_UNAUTHORIZED`                  | 401    | Unauthorized                          |
| `AUTH_INVALID_CREDENTIALS`           | 401    | Invalid credentials                   |
| `AUTH_INVALID_HEADER`                | 401    | Invalid authorization header          |
| `AUTH_INVALID_TOKEN`                 | 401    | Invalid token                         |
| `AUTH_TOKEN_EXPIRED`                 | 401    | Token expired                         |
| `AUTH_FORBIDDEN`                     | 403    | Forbidden                             |
| `AUTH_SCOPE_FORBIDDEN`               | 403    | Token scope forbidden                 |
| `AUTH_USER_NOT_FOUND`                | 400    | User not found or disabled            |
| `AUTH_PASSWORD_DISABLED`             | 403    | Password authentication disabled      |
| `AUTH_PASSWORD_INVALID`              | 403    | Invalid password                      |
| `AUTH_PASSWORD_WEAK`                 | 400    | Password too weak                     |
| `AUTH_PASSWORD_REQUIRED`             | 401    | Password confirmation required        |
| `AUTH_API_KEY_MISSING`               | 401    | API key missing                       |
| `AUTH_API_KEY_INVALID`               | 401    | Invalid API key                       |
| `AUTH_API_KEY_EXPIRED`               | 403    | API key expired                       |
| `AUTH_PROXY_AUTHENTICATION_REQUIRED` | 407    | Proxy authentication required         |
| `AUTH_INVALID_REDIRECT_URL`          | 400    | Invalid redirect URL                  |
| `ACCOUNT_FEATURE_UNAVAILABLE`        | 501    | Account feature unavailable           |
| `ACCOUNT_EMAIL_ALREADY_VERIFIED`     | 409    | Email already verified                |
| `ACCOUNT_PASSWORD_NOT_SET`           | 403    | Password not set                      |
| `OAUTH2_PROVIDER_ERROR`              | 502    | OAuth2 provider error                 |
| `OAUTH2_EMAIL_UNAVAILABLE`           | 403    | OAuth2 email unavailable              |
| `OAUTH2_REGISTRATION_DISABLED`       | 403    | OAuth2 registration disabled          |
| `OAUTH2_ACCOUNT_CONFLICT`            | 409    | OAuth2 account linked to another user |
| `OAUTH2_USER_REJECTED`               | 403    | OAuth2 user rejected                  |
| `RECAPTCHA_MISSING`                  | 400    | reCAPTCHA missing                     |
| `RECAPTCHA_INVALID`                  | 400    | Invalid reCAPTCHA                     |
| `RECAPTCHA_ACTION_MISMATCH`          | 403    | reCAPTCHA action mismatch             |
| `RECAPTCHA_LOW_SCORE`                | 403    | reCAPTCHA low score                   |
| `RECAPTCHA_UNAVAILABLE`              | 502    | reCAPTCHA unavailable                 |
| `FILE_NOT_FOUND`                     | 404    | File not found                        |
| `FILE_FORBIDDEN`                     | 403    | File access forbidden                 |
| `FILE_FIELD_NOT_FOUND`               | 400    | File field not found                  |
| `FILE_UNSUPPORTED_TYPE`              | 415    | Unsupported file type                 |
| `FILE_TOO_LARGE`                     | 413    | File too large                        |
| `FILE_LIMIT_EXCEEDED`                | 400    | File limit exceeded                   |
| `FILE_INVALID_PATH`                  | 400    | Invalid file path                     |
| `FILE_NONE_PROVIDED`                 | 400    | No files provided                     |
| `FILE_UPLOAD_FAILED`                 | 400    | File upload failed                    |
| `FILE_DELETE_FAILED`                 | 400    | File delete failed                    |
| `FILE_STORAGE_ERROR`                 | 500    | File storage error                    |
| `EXPORT_FAILED`                      | 500    | Export failed                         |
| `QUEUE_CLOSED`                       | 503    | Queue closed                          |
| `QUEUE_UNAVAILABLE`                  | 503    | Queue unavailable                     |
| `MAILER_SEND_FAILED`                 | 502    | Email sending failed                  |
| `MAILER_JOB_NOT_FOUND`               | 500    | Email job not found                   |
| `LOCK_NOT_ACQUIRED`                  | 503    | Resource is locked                    |

`REQUEST_FAILED` keeps the 4xx status of an error a Fastify plugin raised with no code of its own.

## Throwing errors in the application

Throw the framework error that fits from a service hook, a policy or a custom route, so the response and the OpenAPI
documentation stay consistent:

```ts
import { ErrorCode, RequestError } from '@appweaver/common';
import { createPolicy, createService, ResourceError } from '@appweaver/core';

export default createService({
  modelName: 'Position',
  beforeCreate: (data) => {
    if (data.salaryMin > data.salaryMax) {
      throw new RequestError(ErrorCode.ValidationFailed, 'salaryMin cannot exceed salaryMax', {
        errors: [{ field: 'salaryMin', rule: 'max', message: 'cannot exceed salaryMax' }]
      });
    }
  }
});

export const policy = createPolicy({
  modelName: 'User',
  writeRestrictions: (user, data, action) => {
    if (user && data.id !== user.id) {
      throw new ResourceError(ErrorCode.ResourceForbidden, 'Only the own profile can be changed', {
        model: 'User',
        action
      });
    }
    return null;
  }
});
```

Leave the unique and the other constraints to the database: the resource services translate a violation into a
`DatabaseError` naming the model fields (a foreign key column as its relation, i.e. `author` for `authorId`), so
there is no need to look a value up before creating a record. A record removed after it was read, i.e. by a
concurrent delete, is a `RESOURCE_NOT_FOUND` of the service. Code calling the Prisma client directly translates its
errors the same way with `toDatabaseError`, which returns any other error as it is:

```ts
import { toDatabaseError } from '@appweaver/core';

try {
  await db.order.update({ where: { id }, data });
} catch (e) {
  throw toDatabaseError(e, 'Order'); // i.e. DATABASE_RECORD_NOT_FOUND
}
```

### Application error codes

Register the errors of the application with `defineErrors`, which maps each to its HTTP status and title, and throw
them with an `ApplicationError`. The errors are named in PascalCase like the members of `ErrorCode`, and the code of
each is derived from its name, i.e. `OUT_OF_STOCK` for `OutOfStock` (typed as that literal), unless the mapping gives
one with `code`. Define them in a module of their own and import the returned codes where they are used, so they are
registered before any route documents them:

```ts
// src/errors.ts
import { defineErrors } from '@appweaver/core';

export const ShopErrors = defineErrors({
  OutOfStock: { status: 409, title: 'Product out of stock' },
  CouponInvalid: { status: 400, title: 'Invalid coupon' }
});
```

```ts
import { ApplicationError } from '@appweaver/common';
import { ShopErrors } from '@/errors';

throw new ApplicationError(ShopErrors.OutOfStock, `Only ${product.stock} left of ${product.name}`, {
  productId: product.id
});
```

A name not in PascalCase, a name or a code of the framework, one registered again with another mapping, or a status
outside 400-599 is rejected with a `ConfigurationError`. The OpenAPI specification names the members of its error code
enum after them (`x-enum-varnames`), so the generated client declares `ErrorCode.OutOfStock` the same way as
`ErrorCode.ResourceNotFound`. An `ApplicationError` with an unregistered code responds with a 500 status and logs a warning.

## Documenting the errors of a route

Every route of the framework documents the errors it can respond with, one response per status narrowing the `code` of
the `ProblemDetails` schema to the codes of that status. Custom routes do the same with `errorResponses`, which always
adds the validation, malformed request, rate limit and internal errors, and `registerRoute` adds the authentication and
reCAPTCHA errors of the route:

```ts
import { ErrorCode } from '@appweaver/common';
import { errorResponses, registerRoute } from '@appweaver/core';
import { ShopErrors } from '@/errors';

registerRoute((router) => {
  router.post('/checkout', {
    schema: {
      response: {
        201: Type.Ref('OrderSingle'),
        ...errorResponses(ShopErrors.OutOfStock, ShopErrors.CouponInvalid, ErrorCode.ResourceNotFound)
      }
    }
  }, handler);
});
```

`errorResponses` rejects a code that is not registered. The route itself declares a `4xx` and a `5xx` response referring
to the `ProblemDetails` schema, listing the codes of each status in the `x-appweaver-errors` extension. The server
moves them out of the route before compiling its serializers, since the error handler builds the problem details itself,
which keeps the start of the server fast. The OpenAPI document expands them into a response per status narrowing the
`code` to its codes, and shares the identical ones between the operations under `components.responses`, each
operation referring to them. A response of a single code is named after it (i.e. `ResourceNotFoundError`), and one of
several after its status and a hash of its codes (i.e. `BadRequestError_1a2b3c`), so a name changes only with its own
codes.

The `code` of the `ProblemDetails` schema is an enum of every framework code and every application code registered
with `defineErrors` before the server is created, i.e. by the application modules. The generated client exports it as
`ErrorCode`, with `isApiError` and `client.isRouteError` typing a caught error by the codes of the API or of a route
(see `client.md`).

## Handling errors outside the API

A queue worker, a scheduled job or a script catches the errors by their code:

```ts
import { ErrorCode, isAppweaverError } from '@appweaver/common';

try {
  await injectService('Order').update(id, { status: 'Shipped' });
} catch (e) {
  if (isAppweaverError(e) && e.is(ErrorCode.DatabaseWriteConflict)) {
    // retry
  }
  throw e;
}
```

The `retries` option of `runTransaction` retries the `DATABASE_WRITE_CONFLICT` errors itself.

## Adding a framework error code

1. Add the member to `ErrorCode` in `packages/common/errors/error-code.ts`, prefixed with its module.
2. Add its details to `ErrorDetailsMap` in `packages/common/errors/error-details.ts`, unless it carries none.
3. Map it in `errorHttpMap` of `packages/core/errors/error-http-map.ts` (a missing mapping fails to compile).
4. List it in the `errorResponses` of the routes that can respond with it, and in the table above.
