# Resources

Resources are the core building blocks of an Appweaver application. There are four resource types that form a
dependency chain: **model** → **service** → **routes** → **policy**. Each resource type is created using a
corresponding factory function and autoloaded from `src/resources/*/` on application start. Source directory and
resources pattern could be changed with `APP_SOURCE_PATH` and `RESOURCE_{MODEL,SERVICE,...}_PATTERN` config variables.

- A **model** is always required.
- A **service** requires a model.
- The **Routes** require a service.
- A **policy** is optional and independent of the chain.

---

## createModel

Creates a resource model definition. The model defines database fields, relations, files, virtual fields, DTOs for
CRUD operations, and index configuration. It is used to generate Prisma schema, TypeScript types, and route
request/response schemas.

```ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Product',
  // ... configuration
});
```

### Configuration

```ts
function createModel(config: ResourceModelConfig, override ?: Partial<ResourceModelConfig>) {
}
```

| Property         | Type                           | Required | Default               | Description                                                         |
|------------------|--------------------------------|----------|-----------------------|---------------------------------------------------------------------|
| `name`           | string                         | yes      | -                     | Model name (PascalCase). Used as database table name and type name. |
| `tableName`      | string                         | no       | (model name)          | Custom database table name override.                                |
| `generateTypes`  | boolean                        | no       | `true`                | Generate TypeScript types for this model.                           |
| `generateSchema` | boolean                        | no       | `true`                | Generate Prisma schema for this model.                              |
| `id`             | IdField                        | no       | Autoincrement integer | ID field configuration.                                             |
| `audit`          | AuditFields                    | no       | All included          | Audit timestamps and creator tracking fields.                       |
| `scalars`        | Record\<string, ScalarField>   | no       | -                     | Scalar fields (database columns).                                   |
| `relations`      | Record\<string, RelationField> | no       | -                     | Relations to other models.                                          |
| `files`          | Record\<string, FileField>     | no       | -                     | File upload fields.                                                 |
| `virtual`        | Record\<string, VirtualField>  | no       | -                     | Computed/virtual fields not stored in database.                     |
| `read`           | OperationConfig                | no       | -                     | Pick/omit fields for the read DTO.                                  |
| `create`         | OperationConfig                | no       | -                     | Pick/omit fields for the create DTO.                                |
| `update`         | OperationConfig                | no       | -                     | Pick/omit fields for the update DTO.                                |
| `export`         | Record\<string, ExportField>   | no       | -                     | CSV export field configuration.                                     |
| `index`          | string[] \| string[][]         | no       | -                     | Database index definitions.                                         |

### ID field

```ts
const config = {
  // Integer ID with autoincrement (default)
  id: {
    type: 'int',
    generator: 'autoincrement()'
  },

  // String ID with generator
  id: {
    type: 'string',
    generator: 'uuid()'
  }
};
```

| Property    | Type                                                                          | Default             | Description                                                                   |
|-------------|-------------------------------------------------------------------------------|---------------------|-------------------------------------------------------------------------------|
| `type`      | `'string'` \| `'int'` \| `'bigInt'`                                           | `'int'`             | ID field data type.                                                           |
| `generator` | `'uuid()'` \| `'uuid(7)'` \| `'cuid()'` \| `'cuid(2)'` \| `'autoincrement()'` | `'autoincrement()'` | Value generator. String types use UUID/CUID, integer types use autoincrement. |

### Audit fields

It is recommended to always use all audit fields for all resource models, unless specified otherwise. In the usual
scenario audit should be left out (including all fields by default).

```ts
const config = {
  // By default all audit fields are included
  audit: {
    createdAt: true,
    updatedAt: true,
    createdById: true
  }
};
```

| Property      | Type    | Default | Description                                     |
|---------------|---------|---------|-------------------------------------------------|
| `createdAt`   | boolean | `true`  | Add `createdAt` timestamp field.                |
| `updatedAt`   | boolean | `true`  | Add `updatedAt` timestamp field.                |
| `createdById` | boolean | `true`  | Add `createdById` foreign key to the auth user. |

### Scalar field types

All scalar fields share these common properties:

| Property           | Type                            | Default | Description                                       |
|--------------------|---------------------------------|---------|---------------------------------------------------|
| `required`         | boolean                         | `true`  | Whether the field is required.                    |
| `unique`           | boolean                         | `false` | Add a unique constraint.                          |
| `hidden`           | boolean                         | `false` | Hide from API output (e.g. password hashes).      |
| `default`          | varies                          | -       | Default value.                                    |
| `defaultGenerated` | boolean                         | `false` | Default is generated by the database.             |
| `array`            | boolean                         | `false` | Store as array (supported on string, int, float). |
| `examples`         | (string \| number \| boolean)[] | -       | Example values for schema documentation.          |

#### String

```ts
const config = {
  title: {
    type: 'string',
    minLength: 1,
    maxLength: 200
  },
  email: {
    type: 'string',
    format: 'email'
  },
  slug: {
    type: 'string',
    pattern: '^[a-z0-9-]+$'
  }
};
```

| Property    | Type                                                                                  | Description                          |
|-------------|---------------------------------------------------------------------------------------|--------------------------------------|
| `type`      | `'string'`                                                                            | String field type.                   |
| `minLength` | number                                                                                | Minimum string length.               |
| `maxLength` | number                                                                                | Maximum string length.               |
| `format`    | `'email'` \| `'hostname'` \| `'ipv4'` \| `'ipv6'` \| `'uri'` \| `'uuid'` \| `'regex'` | Built-in format validation.          |
| `pattern`   | string                                                                                | Custom regex pattern for validation. |

String defaults can also be ID generators: `'uuid()'`, `'uuid(7)'`, `'cuid()'`, `'cuid(2)'`.

#### Number (int, bigInt, float)

```ts
const config = {
  price: {
    type: 'float',
    minimum: 0
  },
  quantity: {
    type: 'int',
    minimum: 0,
    maximum: 10000
  }
};
```

| Property  | Type                               | Description        |
|-----------|------------------------------------|--------------------|
| `type`    | `'int'` \| `'bigInt'` \| `'float'` | Number field type. |
| `minimum` | number                             | Minimum value.     |
| `maximum` | number                             | Maximum value.     |

Integer defaults can be `'autoincrement()'`.

#### Boolean

```ts
const config = {
  enabled: {
    type: 'boolean',
    default: true
  }
};
```

| Property | Type        | Description         |
|----------|-------------|---------------------|
| `type`   | `'boolean'` | Boolean field type. |

#### DateTime

```ts
const config = {
  publishedAt: {
    type: 'dateTime',
    default: 'now()'
  },
  eventDate: {
    type: 'dateTime',
    format: 'date'
  }
};
```

| Property | Type                                  | Description          |
|----------|---------------------------------------|----------------------|
| `type`   | `'dateTime'`                          | DateTime field type. |
| `format` | `'date-time'` \| `'time'` \| `'date'` | DateTime format.     |

Default can be `'now()'` for current timestamp.

#### JSON

```ts
const config = {
  metadata: {
    type: 'json',
    default: {}
  }
};
```

| Property | Type     | Description                                          |
|----------|----------|------------------------------------------------------|
| `type`   | `'json'` | JSON field type. Stores arbitrary objects or arrays. |

#### Enum

```ts
const config = {
  status: {
    type: 'enum',
    values: ['Draft', 'Active', 'Sold'],
    default: 'Draft'
  }
};
```

| Property | Type     | Description                     |
|----------|----------|---------------------------------|
| `type`   | `'enum'` | Enum field type.                |
| `values` | string[] | Allowed enum values (required). |

### Relations

```ts
const config = {
  relations: {
    category: {
      model: 'Category',
      owner: true,
      output: {
        type: 'always'
      }
    },
    reviews: {
      model: 'Review',
      array: true,
      mappedBy: 'product',
      output: {
        type: 'single',
        count: true
      }
    }
  }
};
```

| Property            | Type              | Default      | Description                                       |
|---------------------|-------------------|--------------|---------------------------------------------------|
| `model`             | string            | **required** | Target model name.                                |
| `owner`             | boolean           | `false`      | This side owns the foreign key.                   |
| `mappedBy`          | string            | -            | Name of the inverse relation on the target model. |
| `array`             | boolean           | `false`      | One-to-many or many-to-many relation.             |
| `unique`            | boolean           | `false`      | One-to-one relation (unique foreign key).         |
| `required`          | boolean           | `true`       | Whether the relation is required.                 |
| `minItems`          | number            | -            | Minimum items for array relations.                |
| `createIfNotExists` | boolean           | `false`      | Auto-create related record if it doesn't exist.   |
| `orphanRemoval`     | boolean           | `false`      | Delete orphaned records when parent is deleted.   |
| `onDelete`          | ReferentialAction | -            | Foreign key action on delete.                     |
| `onUpdate`          | ReferentialAction | -            | Foreign key action on update.                     |
| `input`             | RelationInput     | -            | Input DTO configuration.                          |
| `output`            | RelationOutput    | -            | Output DTO configuration.                         |

**ReferentialAction values**: `'cascade'`, `'restrict'`, `'noAction'`, `'setNull'`, `'setDefault'`

#### Relation input

| Property    | Type                                            | Description                                       |
|-------------|-------------------------------------------------|---------------------------------------------------|
| `type`      | `'all'` \| `'create'` \| `'update'` \| `'none'` | When the relation field is available as input.    |
| `uniqueKey` | string                                          | Use a unique key field instead of ID for linking. |
| `fullModel` | boolean                                         | Accept full nested model object as input.         |

#### Relation output

| Property  | Type                                                 | Description                                                                                                                            |
|-----------|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `type`    | `'always'` \| `'single'` \| `'multiple'` \| `'none'` | When to include the relation in output. `always` = all reads, `single` = single record reads, `multiple` = list reads, `none` = never. |
| `include` | Record\<string, RelationOutput>                      | Nested relation output configuration.                                                                                                  |
| `count`   | boolean                                              | Include a count of related records.                                                                                                    |

### File fields

```ts
const config = {
  files: {
    photo: {
      mimeType: 'image/*',
      namePattern: 'photos/{userId}-{name}-{hash}.{extension}',
      maxSize: '2 MB'
    },
    documents: {
      mimeType: 'application/pdf',
      array: true,
      maxCount: 5
    }
  }
};
```

| Property      | Type               | Description                                                             |
|---------------|--------------------|-------------------------------------------------------------------------|
| `mimeType`    | string \| RegExp   | Allowed MIME types (glob patterns like `'image/*'` supported).          |
| `namePattern` | string \| function | File naming pattern or function (available variables are listed below). |
| `array`       | boolean            | Allow multiple files.                                                   |
| `maxSize`     | number \| string   | Maximum file size (e.g. `'2 MB'`, `5242880`).                           |
| `maxCount`    | number             | Maximum number of files (for array fields).                             |
| `output`      | RelationOutput     | When to include file info in output.                                    |

#### Available namePattern variables

Default pattern is: `{name}-{hash}.{extension}`.

| Variable        | Type   | Description                                 |
|-----------------|--------|---------------------------------------------|
| `name`          | string | Original filename without extension.        |
| `extension`     | string | Original file extension.                    |
| `resourceField` | string | Field name the file is assigned to.         |
| `resourceName`  | string | Resource model name.                        |
| `resourceId`    | string | Resource ID.                                |
| `userId`        | string | Authenticated user ID.                      |
| `userEmail`     | string | Authenticated user email.                   |
| `year`          | number | Current UTC year.                           |
| `month`         | number | Current UTC month (1-12).                   |
| `day`           | number | Current UTC day of month.                   |
| `weekDay`       | number | Current UTC day of week (0-6, Sunday is 0). |
| `yearWeek`      | number | ISO week number.                            |
| `yearDay`       | number | Day of year (1-366).                        |
| `hours`         | number | Current UTC hours.                          |
| `minutes`       | number | Current UTC minutes.                        |
| `seconds`       | number | Current UTC seconds.                        |
| `milliseconds`  | number | Current UTC milliseconds.                   |
| `timestamp`     | number | Unix timestamp in milliseconds.             |
| `date`          | string | Current date in ISO 8601 format.            |
| `uuid`          | string | Generated random UUID.                      |
| `hash`          | string | Generated random hash (32 bytes).           |

### Virtual fields

Virtual fields are computed values not stored in the database. They can appear in input DTOs (to receive data) and/or
output DTOs (to return computed values).

```ts
const config = {
  virtual: {
    displayName: {
      type: 'string',
      output: {
        type: 'always',
        value: (resource) => `${resource.firstName} ${resource.lastName}`
      }
    },
    inviteCode: {
      type: 'string',
      input: {
        type: 'create'
      }
    }
  }
};
```

| Property         | Type                                                 | Description                                                |
|------------------|------------------------------------------------------|------------------------------------------------------------|
| *(scalar props)* | -                                                    | All scalar field properties (type, minLength, etc.) apply. |
| `input.type`     | `'all'` \| `'create'` \| `'update'` \| `'none'`      | When the virtual field accepts input.                      |
| `input.value`    | primitive \| function                                | Default value or transformer for input.                    |
| `output.type`    | `'always'` \| `'single'` \| `'multiple'` \| `'none'` | When the virtual field appears in output.                  |
| `output.value`   | primitive \| function                                | Computed value or transformer for output.                  |

### Operation config (read, create, update)

Control which fields appear in each DTO. Use `pick` for an allowlist or `omit` for a deny-list.

```ts
const config = {
  create: {
    omit: ['status']         // All fields except status
  },
  update: {
    pick: ['title', 'price'] // Only title and price
  }
};
```

| Property | Type     | Description                                    |
|----------|----------|------------------------------------------------|
| `omit`   | string[] | Fields to exclude from the DTO.                |
| `pick`   | string[] | Fields to include in the DTO (overrides omit). |

### Export config

Configure CSV export behavior per field:

```ts
const config = {
  export: {
    price: {
      headerName: 'Product Price',
      mapValue: 'price'
    },
    passwordHash: {
      exclude: true
    },
    status: {
      mapValue: (val) => val.toUpperCase()
    },
    author: {
      firstName: {
        headerName: 'Given Name'
      },
      lastName: {
        headerName: 'Family Name'
      }
    }
  }
};
```

| Property     | Type               | Description                        |
|--------------|--------------------|------------------------------------|
| `headerName` | string             | Custom CSV column header name.     |
| `exclude`    | boolean            | Exclude this field from exports.   |
| `mapValue`   | string \| function | Transform the value during export. |

### Index config

Define database indexes as a flat array (single-field indexes) or nested arrays (composite indexes):

```ts
index: ['title']                          // Single-field index on title
index: [['status', 'categoryId']]         // Composite index on status + categoryId
index: ['email', ['status', 'createdAt']] // Both single and composite
```

### Generated models

`createModel` produces the following TypeBox schema models used internally by routes and services:

| Model             | Purpose                            |
|-------------------|------------------------------------|
| `readModel`       | Full model with all visible fields |
| `createModel`     | Request body for create operations |
| `updateModel`     | Request body for update operations |
| `relationsModel`  | Relations-only subset              |
| `virtualModel`    | Virtual fields-only subset         |
| `filesModel`      | File fields-only subset            |
| `readOneModel`    | Response for single-item reads     |
| `readManyModel`   | Response for list reads            |
| `createOneModel`  | Request for create endpoint        |
| `updateOneModel`  | Request for update endpoint        |
| `fileUploadModel` | Request for file upload endpoint   |
| `fileDeleteModel` | Request for file delete endpoint   |

---

## createService

Creates a resource service with lifecycle hooks and business logic. The service handles all database operations for a
model and triggers hooks on each CRUD operation before/after.

```ts
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Product',
  afterCreate: (resource) => {
    logger.info(`Product created: ${resource.id}`);
  },
  textSearch: {
    title: { contains: '{input}', mode: 'insensitive' }
  }
});
```

### Configuration

```ts
function createService(config: ResourceServiceConfig, override ?: Partial<ResourceServiceConfig>) {
}
```

| Property          | Type                                                                     | Description                                                                                                                     |
|-------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `modelName`       | string                                                                   | Model name to bind this service to (required).                                                                                  |
| `beforeFind`      | `(id) => void`                                                           | Hook called before finding a single resource.                                                                                   |
| `beforeQuery`     | `(filter, page, size, sort) => void`                                     | Hook called before querying resources.                                                                                          |
| `beforeAggregate` | `(filter, select, dateField, from?, to?, step?, safeIncrement?) => void` | Hook called before aggregation.                                                                                                 |
| `beforeCreate`    | `(data) => void`                                                         | Hook called before creating a resource. Mutate `data` to modify input.                                                          |
| `beforeUpdate`    | `(id, data) => void`                                                     | Hook called before updating a resource.                                                                                         |
| `beforeDelete`    | `(id) => void`                                                           | Hook called before deleting a resource.                                                                                         |
| `afterFind`       | `(resource) => void`                                                     | Hook called after finding a resource.                                                                                           |
| `afterQuery`      | `(response) => void`                                                     | Hook called after querying resources.                                                                                           |
| `afterAggregate`  | `(response) => void`                                                     | Hook called after aggregation.                                                                                                  |
| `afterCreate`     | `(resource) => void`                                                     | Hook called after creating a resource.                                                                                          |
| `afterUpdate`     | `(resource) => void`                                                     | Hook called after updating a resource.                                                                                          |
| `afterDelete`     | `(resource) => void`                                                     | Hook called after deleting a resource.                                                                                          |
| `textSearch`      | object \| function                                                       | Prisma filter object or function `(input: string) => filter` for text search. Use `'{input}'` as placeholder in filter objects. |

All hooks can be synchronous or return a `Promise`.

### Service methods

The created service exposes the following methods:

| Method      | Signature                                                                                         | Description                                              |
|-------------|---------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| `find`      | `(id) => Promise<ReadOne>`                                                                        | Find a single resource by ID.                            |
| `query`     | `(filter?, page?, size?, sort?) => Promise<QueryResponse>`                                        | Query resources with filtering, pagination, and sorting. |
| `aggregate` | `(filter?, select?, dateField?, from?, to?, step?, safeIncrement?) => Promise<AggregateResponse>` | Aggregate resources with time-series grouping.           |
| `create`    | `(data) => Promise<ReadOne>`                                                                      | Create a new resource.                                   |
| `update`    | `(id, data) => Promise<ReadOne>`                                                                  | Update an existing resource.                             |
| `delete`    | `(id) => Promise<ReadOne>`                                                                        | Delete a resource.                                       |

### Query response

```ts
const config = {
  resultCount: 123, // Items in this page
  totalCount: 123,  // Total items matching filter
  items: []         // Page data
};
```

### Aggregate response

```ts
const resp = {
  total: AggregateValue,         // Overall aggregation
  items: Arrray<AggregateResult> // Per-period results
};

// Each AggregateResult:
const result = {
  date: 'Date',
  result: {
    [field]:
      {
        count: 123,
        min: 123,
        max: 123,
        avg: 123,
        sum: 123,
        first: 123,
        last: 123
      }
  }
};
```

### Text search example

Object form with placeholder:

```ts
const config = {
  textSearch: {
    title: {
      contains: '{input}', mode:
        'insensitive'
    }
  }
};
```

Function form for complex queries:

```ts
const config = {
  textSearch: (input) => ({
    OR: [
      { title: { contains: input, mode: 'insensitive' } },
      { description: { contains: input, mode: 'insensitive' } }
    ]
  })
};
```

---

## createRoutes

Creates CRUD route definitions for a resource. Routes are automatically registered with Fastify and derive their
request/response schemas from the resource model.

```ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Product',
  path: '/products',
  find: { roles: ['Admin', 'User'], rateLimit: { max: 100 } },
  query: { cache: true, cacheTTL: 5000 },
  create: { permissions: ['product:create'] },
  delete: { exclude: true }
});
```

### Configuration

```ts
function createRoutes(config: ResourceRoutesConfig, override ?: Partial<ResourceRoutesConfig>) {
}
```

| Property     | Type            | Description                                              |
|--------------|-----------------|----------------------------------------------------------|
| `modelName`  | string          | Model name to bind routes to (required).                 |
| `path`       | string          | Custom base URL path (default: derived from model name). |
| `find`       | ReadRouteConfig | `GET /:id` - Find single resource by ID.                 |
| `query`      | ReadRouteConfig | `POST /query` - Query resources with filters.            |
| `aggregate`  | ReadRouteConfig | `POST /aggregate` - Aggregate resources.                 |
| `create`     | RouteConfig     | `POST /` - Create a new resource.                        |
| `update`     | RouteConfig     | `PUT /:id` - Update a resource.                          |
| `delete`     | RouteConfig     | `DELETE /:id` - Delete a resource.                       |
| `export`     | RouteConfig     | `POST /export` - Export resources to CSV.                |
| `fileUpload` | RouteConfig     | `POST /:id/files` - Upload files to a resource.          |
| `fileDelete` | RouteConfig     | `POST /:id/delete-files` - Delete files from a resource. |

### Route config (all operations)

| Property          | Type                     | Default | Description                                                   |
|-------------------|--------------------------|---------|---------------------------------------------------------------|
| `exclude`         | boolean                  | `false` | Exclude this operation entirely.                              |
| `public`          | boolean                  | `false` | No authentication required.                                   |
| `roles`           | string[]                 | -       | Required roles (OR logic by default).                         |
| `permissions`     | string[]                 | -       | Required permissions (OR logic by default).                   |
| `auth`            | AuthType[]               | -       | Allowed authentication types: `'jwt'`, `'apiKey'`, `'basic'`. |
| `rateLimit`       | RateLimitConfig \| false | -       | Per-operation rate limiting. `false` disables.                |
| `recaptcha`       | boolean                  | `false` | Require reCAPTCHA verification.                               |
| `recaptchaAction` | string                   | -       | Expected reCAPTCHA action name for score validation.          |

### Read route config (find, query, aggregate)

Extends RouteConfig with caching options:

| Property                | Type               | Default | Description                                                    |
|-------------------------|--------------------|---------|----------------------------------------------------------------|
| `cache`                 | boolean            | `false` | Enable response caching.                                       |
| `cacheKey`              | string \| function | -       | Custom cache key. Function signature: `(req, user) => string`. |
| `cacheTTL`              | number             | -       | Cache TTL in milliseconds (overrides global default).          |
| `cacheSkipInvalidation` | boolean            | `false` | Skip automatic cache invalidation on writes.                   |

### Rate limit config

```ts
const config = {
  rateLimit: {
    max: 100,
    timeWindow: 60000,
    allowList: ['127.0.0.1'],
    keyGenerator: (req) => req.ip
  }
};
```

| Property       | Type                         | Description                                                         |
|----------------|------------------------------|---------------------------------------------------------------------|
| `max`          | number \| function           | Maximum requests per time window. Function: `(req, key) => number`. |
| `timeWindow`   | number \| string \| function | Window duration in ms. Function: `(req, key) => number`.            |
| `allowList`    | string[] \| function         | IPs exempt from limiting. Function: `(req, key) => boolean`.        |
| `keyGenerator` | function                     | Custom key generator. Signature: `(req) => string \| number`.       |

---

## createPolicy

Creates row-level security policies for a resource. The service layer evaluates the policy on every CRUD operation to
enforce fine-grained authorization beyond static role/permission checks.

```ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Product',
  checkAccess: (action, resource) => resource.status === 'Draft',
  readRestrictions: (action, resource) => ({
    enabled: true
  }),
  files: {
    photo: { accessType: 'public' }
  }
});
```

### Configuration

```ts
function createPolicy(config: ResourcePolicyConfig, override ?: Partial<ResourcePolicyConfig>) {
}
```

| Property            | Type                            | Description                                                                                                               |
|---------------------|---------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `modelName`         | string                          | Model name to bind this policy to (required).                                                                             |
| `checkAccess`       | `(action, resource) => boolean` | Dynamic access check against a resource instance. Return `true` to allow, `false` to deny.                                |
| `readRestrictions`  | `(action, resource) => filter`  | Returns a Prisma filter object applied to all read queries (find, query, aggregate). Restricts which records are visible. |
| `writeRestrictions` | `(action, resource) => data`    | Returns data to merge or validate on create/update operations.                                                            |
| `files`             | Record\<string, FilePolicy>     | Per-file field access policy.                                                                                             |

**Action types**: `'find'`, `'query'`, `'aggregate'`, `'create'`, `'update'`, `'delete'`

### File policy

| Property     | Type                                       | Default       | Description                                                                                      |
|--------------|--------------------------------------------|---------------|--------------------------------------------------------------------------------------------------|
| `accessType` | `'public'` \| `'protected'` \| `'private'` | `'protected'` | File access level. `public` = anyone, `protected` = authenticated users, `private` = owner only. |
| `canAccess`  | `(user, resource, file) => boolean`        | -             | Custom access check for reading files.                                                           |
| `canCreate`  | `(user, resource, file) => boolean`        | -             | Custom access check for uploading files.                                                         |
| `canDelete`  | `(user, resource, file) => boolean`        | -             | Custom access check for deleting files.                                                          |

---

## registerRoute

Registers a custom Fastify route handler outside the resource system. Use this for endpoints that don't map to a
standard CRUD resource.

```ts
import { registerRoute, Router } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerRoute(
  async function (router: Router) {
    router.get('/search-result', {
      schema: {
        summary: 'Sample search result response route',
        response: { 200: Type.Ref('SearchResult') }
      },
      handler: async () => {
        return { message: 'Hello, world!' };
      }
    });
  },
  { public: true, cacheTTL: 15000 }
);
```

### Config options

| Property                | Type                     | Description                                 |
|-------------------------|--------------------------|---------------------------------------------|
| `exclude`               | boolean                  | Skip registration of this route.            |
| `public`                | boolean                  | No authentication required.                 |
| `roles`                 | string[]                 | Required roles.                             |
| `permissions`           | string[]                 | Required permissions.                       |
| `auth`                  | AuthType[]               | Allowed authentication types.               |
| `rateLimit`             | RateLimitConfig \| false | Rate limiting configuration.                |
| `recaptcha`             | boolean                  | Require reCAPTCHA verification.             |
| `recaptchaAction`       | string                   | Expected reCAPTCHA action.                  |
| `cache`                 | boolean                  | Enable response caching.                    |
| `cacheKey`              | string \| function       | Custom cache key.                           |
| `cacheTTL`              | number                   | Cache TTL in milliseconds.                  |
| `cacheSkipInvalidation` | boolean                  | Skip automatic cache invalidation.          |
| `cacheModelName`        | string                   | Model name for cache invalidation tracking. |
| `cacheRelations`        | string[]                 | Related model names for cache invalidation. |

---

## registerModel

Registers a custom TypeBox schema as a named model in the schema registry. Registered models can be referenced using
`Type.Ref('ModelName')` in route schemas.

```ts
import { registerModel } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerModel(
  'SearchResult',
  Type.Object({
    id: Type.Number(),
    title: Type.String(),
    score: Type.Number({ minimum: 0, maximum: 1 })
  })
);
```

| Parameter | Type    | Description                                    |
|-----------|---------|------------------------------------------------|
| `name`    | string  | Schema identifier for `Type.Ref()` references. |
| `schema`  | TObject | TypeBox object schema definition.              |

---

## registerPlugin

Registers a custom Fastify plugin. Plugins are wrapped with `fastify-plugin` so their decorators and hooks are scoped
to the entire server instance.

```ts
import { registerPlugin } from '@appweaver/core';

registerPlugin(
  'audit-log',
  async (server) => {
    server.addHook('onResponse', async (request, reply) => {
      logger.info(`${request.method} ${request.url} -> ${reply.statusCode}`);
    });
  },
  ['other-plugin'] // optional dependencies
);
```

| Parameter      | Type                                | Description                                           |
|----------------|-------------------------------------|-------------------------------------------------------|
| `name`         | string                              | Plugin name (used for dependency resolution).         |
| `plugin`       | `(server) => void \| Promise<void>` | Fastify plugin function.                              |
| `dependencies` | string[]                            | Optional list of plugin names this plugin depends on. |
