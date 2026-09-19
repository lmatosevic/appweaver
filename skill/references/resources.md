# Resources

Resources are the core building blocks of an Appweaver application. There are four resource types that form a dependency
chain: **model** → **service** → **routes** → **policy**. Each resource type is created using a corresponding factory
function and autoloaded from `src/resources/*/` on application start. Source directory and resources pattern could be
changed with `APP_SOURCE_PATH` and `RESOURCE_{MODEL,SERVICE,...}_PATTERN` config variables.

- A **model** is always required.
- A **service** requires a model.
- The **Routes** require a service.
- A **policy** is optional and independent of the chain.

---

## createModel

Creates a resource model definition. The model defines database fields, relations, files, virtual fields, DTOs for CRUD
operations, and index configuration. It is used to generate Prisma schema, TypeScript types, and route request/response
schemas.

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
| `index`          | string[] \| string[][]         | no       | -                     | Database index definitions (`-field` desc, `+field` asc).           |
| `unique`         | string[] \| string[][]         | no       | -                     | Composite unique constraints, in the same shape as `index`.         |
| `softDelete`     | boolean                        | no       | `false`               | Mark deleted records instead of removing them.                      |

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

| Property    | Type                                                                                          | Default                                       | Description                                          |
|-------------|-----------------------------------------------------------------------------------------------|-----------------------------------------------|------------------------------------------------------|
| `type`      | `'string'` \| `'int'` \| `'bigInt'`                                                           | `'int'`                                       | ID field data type.                                  |
| `generator` | `'uuid()'` \| `'uuid(7)'` \| `'cuid()'` \| `'cuid(2)'` \| `'nanoid()'` \| `'autoincrement()'` | `'autoincrement()'` (`'uuid()'` for `string`) | Value generator. String types use UUID/CUID/Nano ID. |

Declaring only a string generator (i.e. `{ generator: 'cuid()' }`) infers the `'string'` type.

#### String IDs

String IDs are generated on creation like auto-incrementing integers, so no value is sent. Both ID types can be mixed
across models in the same project, and the choice flows through everywhere the primary key appears:

| Where                          | Integer ID               | String ID                               |
|--------------------------------|--------------------------|-----------------------------------------|
| Prisma column                  | `id Int @id`             | `id String @id`                         |
| Generated TypeScript type      | `id: number`             | `id: string`                            |
| Route path parameter           | `GET /posts/{id}` number | `GET /comments/{id}` string             |
| Foreign key on a related model | `authorId Int`           | `pinnedCommentId String`                |
| Relation input                 | `{ author: 12 }`         | `{ pinnedComment: 'k4pcxi0t5vs8rl65' }` |
| `createdById` audit column     | `Int?`                   | `String?` (follows the auth model)      |
| Service methods                | `find(12)`               | `find('k4pcxi0t5vs8rl65')`              |

#### Generated column types

Generated string columns are sized after the value they hold, on the primary key, the foreign keys referencing it, and
any string scalar with a `defaultGenerator`. SQLite keeps the plain column.

| Generator           | PostgreSQL        | MySQL             | SQL Server             |
|---------------------|-------------------|-------------------|------------------------|
| `uuid()`, `uuid(7)` | `@db.Uuid`        | `@db.Char(36)`    | `@db.UniqueIdentifier` |
| `cuid()`            | `@db.VarChar(25)` | `@db.VarChar(25)` | `@db.VarChar(25)`      |
| `cuid(2)`           | `@db.VarChar(24)` | `@db.VarChar(24)` | `@db.VarChar(24)`      |
| `nanoid()`          | `@db.VarChar(21)` | `@db.VarChar(21)` | `@db.VarChar(21)`      |

The generator width wins over an explicit `maxLength`, which only bounds what the API accepts.

Service and hook signatures take `ResourceId` (`number | string`), so they work with either ID type:

```ts
import { ResourceId } from '@appweaver/common';

export default createService({
  modelName: 'Comment',
  beforeFind: (id: ResourceId) => console.log('Finding comment', id)
});
```

The `resourceId` column of the built-in `File` model stores the owning record ID as text, so files attach to resources
with either ID type.

> Changing the ID type of the existing model rewrites its primary key column and every foreign key pointing at it. Run
> `weaver generate` then `weaver migration new <name>`, and treat it as destructive on a populated database.

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

### Soft delete

A model with `softDelete` enabled keeps its deleted records in the database instead of removing them. The delete marks
the record with two extra columns. They are hidden fields: typed on the full generated model type (i.e. `Post`), so
server code can read them, but never part of any API request or response, nor of the OpenAPI document:

| Column        | Type                | Description                                                            |
|---------------|---------------------|------------------------------------------------------------------------|
| `deletedAt`   | `DateTime?`         | When the record was deleted, `null` for a live record.                 |
| `deletedById` | auth model id (`?`) | The user who deleted the record. Only added when an auth model exists. |

`deletedById` is indexed like any other foreign key, but `deletedAt` is not. Every read filters on `deletedAt IS NULL`,
so add the column to the indexes matching the queries of the model where it helps, i.e.
`index: [['deletedAt', '-createdAt', 'id']]` for the default listing.

```ts
const config = {
  softDelete: true
};
```

The stored files of a soft deleted record are **kept** by default, so a manual restore loses nothing, while a record
removed from the database loses them by default. Each file field decides for itself with `onResourceSoftDeleted` and
`onResourceDeleted` (see [File fields](#file-fields)). A kept file is never served again, see
[Files of deleted resources](./storage.md#deleting-all-files-on-resource-deletion).

```ts
const config = {
  softDelete: true,
  files: {
    avatar: {}, // kept on soft delete, removed on a database delete
    idScan: { onResourceSoftDeleted: 'delete' } // removed on both
  }
};
```

Soft deleted records are hidden from every read, so for API users a soft delete is indistinguishable from a real one:

- `find`, `update` and `delete` respond with 404, `query`, `aggregate` and `export` leave the record out.
- List relations and relation counts skip it, a single relation pointing at it reads as `null`.
- Relation filters never match through it: `_some`, `_none`, `_every` and `_exists` only consider live records, and a
  `null` filter on a single relation matches a deleted related record.
- Connecting or inline updating it through a relation input is rejected with 400.
- Its files are served as missing, whether they were kept or removed.

Restoring a record, or reading the deleted ones, is not part of the API: set `deletedAt` and `deletedById` back to
`null` in the database, on the record, on the records soft deleted with it and on the `File` rows of its kept files,
which all share the same `deletedAt` value. Unique values of a deleted record stay taken until the row is removed.

The delete follows the `onDelete` action of every relation referencing the record, mirroring a database delete:

| `onDelete` of the referencing relation        | On soft delete                                                                      |
|-----------------------------------------------|-------------------------------------------------------------------------------------|
| `cascade`                                     | The referencing records are soft deleted with the same `deletedAt`, level by level. |
| `restrict`, `noAction` (default if required)  | The delete fails with 409 while a live record references it.                        |
| `setNull`, `setDefault` (default if optional) | The reference is kept, so a manual restore brings the link back.                    |

A soft delete never runs the database cascade, so every model a soft deleted model cascades into must enable
`softDelete` too. The application refuses to start and `weaver generate` fails otherwise:

```
Model 'Comment' must enable 'softDelete', since its relation 'Comment.post' cascades on delete from the soft deleted model 'Post'.
```

The framework owned `ApiKey` and `ConnectedAccount` models cascade from the auth model, so they enable `softDelete`
automatically when the auth model does.

After enabling `softDelete` on a model, regenerate the schema and create a migration (`weaver generate`, then
`weaver migration new <name>`).

### Scalar field types

All scalar fields share these common properties:

| Property            | Type                        | Default | Description                                                                                                                 |
|---------------------|-----------------------------|---------|-----------------------------------------------------------------------------------------------------------------------------|
| `required`          | boolean                     | `true`  | Whether the field is required.                                                                                              |
| `unique`            | boolean                     | `false` | Add a unique constraint.                                                                                                    |
| `hidden`            | boolean                     | `false` | Hide from API output (e.g. password hashes).                                                                                |
| `default`           | varies                      | -       | Default static value.                                                                                                       |
| `defaultGenerator`  | string                      | -       | Default is generated by function (e.g. uuid(), cuid(), autoincrement(), now(), ...).                                        |
| `defaultExpression` | string                      | -       | Default is generated by database expression in supported database syntax (e.g. concat('token_', gen_random_uuid()))::TEXT). |
| `array`             | boolean                     | `false` | Store as array (supported on string, int, float).                                                                           |
| `example`           | string \| number \| boolean | -       | Example value for OpenAPI (Swagger) schema documentation.                                                                   |

A `default` must satisfy the constraints declared on its own field (`minimum`, `maximum`, `minLength`, `maxLength`,
`pattern`, enum `values`) and match its type. The application **refuses to start** otherwise, naming every offending
field.

#### String

```ts
const config = {
  title: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    default: 'No title'
  },
  email: {
    type: 'string',
    format: 'email'
  },
  slug: {
    type: 'string',
    pattern: '^[a-z0-9-]+$'
  },
  code: {
    type: 'string',
    defaultGenerator: 'uuid()'
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

String defaults can also be ID generators: `'uuid()'`, `'uuid(7)'`, `'cuid()'`, `'cuid(2)'`, `'nanoid()'`, which also
size the column (see [Generated column types](#generated-column-types)).

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
    defaultGenerator: 'now()'
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
// src/resources/product/model.ts
const config = {
  relations: {
    category: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'products',
      owner: true,
      output: {
        type: 'always'
      }
    },
    reviews: {
      model: 'Review',
      type: 'oneToMany',
      mappedBy: 'product',
      output: {
        type: 'single',
        count: true
      }
    }
  }
};
```

```ts
// src/resources/category/model.ts
const config = {
  relations: {
    products: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'category',
      output: {
        type: 'single'
      }
    }
  }
};
```

```ts
// src/resources/review/model.ts
const config = {
  relations: {
    product: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'reviews',
      owner: true,
      input: {
        type: 'none'
      }
    }
  }
};
```

| Property        | Type                                            | Default      | Description                                                              |
|-----------------|-------------------------------------------------|--------------|--------------------------------------------------------------------------|
| `model`         | string                                          | **required** | Target model name.                                                       |
| `type`          | `'oneToOne'` \| `'oneToMany'` \| `'manyToMany'` | **required** | Relation cardinality between the two models.                             |
| `owner`         | boolean                                         | `false`      | This side owns the foreign key column (only one side should be owner).   |
| `mappedBy`      | string                                          | -            | Name of the inverse relation on the target model.                        |
| `required`      | boolean                                         | `true`       | Whether the relation is required (nullable foreign key if not required). |
| `minItems`      | number                                          | -            | Minimum items for list relations.                                        |
| `orphanRemoval` | boolean                                         | `false`      | Delete the related records an update removes from the relation.          |
| `onDelete`      | ReferentialAction                               | -            | Foreign key action on delete.                                            |
| `onUpdate`      | ReferentialAction                               | -            | Foreign key action on update.                                            |
| `index`         | boolean                                         | `true`       | Index the foreign key column; `false` leaves it unindexed.               |
| `input`         | RelationInput                                   | -            | Input DTO configuration.                                                 |
| `output`        | RelationOutput                                  | -            | Output DTO configuration.                                                |

**ReferentialAction values**: `'cascade'`, `'restrict'`, `'noAction'`, `'setNull'`, `'setDefault'`

Without an explicit `onDelete`, a **required** owning relation falls back to `restrict`, so deleting the referenced
record fails with a foreign key violation while any child row still exists. Set `onDelete: 'cascade'` on relations whose
rows are owned by the parent and meaningless without it. Optional owning relations (`required: false`) fall back to
`setNull`, which already lets the referenced record be deleted.

The stored files of the records a `cascade` removes are cleaned up together with the files of the deleted record. A
model with soft delete applies the same actions itself, see its section.

With `orphanRemoval: true`, an update deletes the related records it removes from the relation instead of only
disconnecting them. The orphans are deleted like any other record: their stored files are removed following
`onResourceDeleted` and the records cascading from them are removed too. Orphans of a model with `softDelete` enabled
are soft deleted instead, keep their
references for a manual restore, and keep their files unless a field sets `onResourceSoftDeleted: 'delete'`.

#### Relationship types

The `type` property declares the relation cardinality explicitly, and `owner` marks the side that holds the foreign key
column in the generated table:

**One-to-One** (`type: 'oneToOne'`): Both sides reference a single record. The side with `owner: true` holds a unique
foreign key; the inverse side is always optional.

```ts
// User model
const config = {
  relations: {
    profile: {
      model: 'Profile',
      type: 'oneToOne',
      mappedBy: 'user',
      owner: true,
      required: false // otherwise the Profile DTO must be sent when creating the user resource
    }
  }
};
```

```ts
// Profile model
const config = {
  relations: {
    user: {
      model: 'User',
      type: 'oneToOne',
      mappedBy: 'profile'
    }
  }
};
```

**One-to-Many** (`type: 'oneToMany'`): The "many" side (which holds the foreign key) has `owner: true` and references a
single record; the "one" side has no `owner` and holds a list of related records.

```ts
// Category model (one, list side)
const config = {
  relations: {
    products: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'category'
    }
  }
};
```

```ts
// Product model (many, foreign key side)
const config = {
  relations: {
    category: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'products',
      owner: true
    }
  }
};
```

**Many-to-Many** (`type: 'manyToMany'`): Both sides hold lists of related records, joined through an implicit join
table. The `owner` property has no effect on this relation type.

```ts
// Post model
const config = {
  relations: {
    tags: {
      model: 'Tag',
      type: 'manyToMany',
      mappedBy: 'posts'
    }
  }
};
```

```ts
// Tag model
const config = {
  relations: {
    posts: {
      model: 'Post',
      type: 'manyToMany',
      mappedBy: 'tags'
    }
  }
};
```

#### Relation pair validation

`weaver generate` validates every bidirectional relation pair linked through `mappedBy` and fails schema generation with
a descriptive error when the two sides are inconsistent:

- Both sides must declare the same relation `type`.
- The mapped relation must reference the declaring model back via its `model` property.
- For `oneToOne` and `oneToMany` relations, exactly one side must declare `owner: true` (neither or both is an error).

A relation whose `mappedBy` field does not exist on the target model is treated as single-sided and skipped by the
validation; an inverse field is generated automatically in the Prisma schema.

#### Relation input

| Property      | Type                                            | Description                                                                                           |
|---------------|-------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| `type`        | `'all'` \| `'create'` \| `'update'` \| `'none'` | When the relation field is available as input.                                                        |
| `allowCreate` | boolean                                         | Allow creating related records inline (input objects without an `id`).                                |
| `allowUpdate` | boolean                                         | Allow updating related records inline on parent update requests (input objects with a required `id`). |
| `uniqueKey`   | string                                          | Unique field matching existing records, turning an inline create into a connect-or-create.            |

Both flags are off by default: a relation only connects existing records unless `allowCreate` / `allowUpdate` is set.

By default, a relation input only connects existing records. It accepts an id value, an `{ id }` object, or an array of
either for list relations. The `allowCreate` and `allowUpdate` flags also accept the related model's own data:

- **`allowCreate: true`** — input objects **without** an `id` create the related record inline. The accepted fields are
  the related model's create data, without its own relations and files (`<Model>RelationCreate`).
- **`allowUpdate: true`** — input objects **with** an `id` and further fields update the related record inline
  (`<Model>RelationUpdate`). Objects carrying only an `id` are connected instead. This applies to parent **update**
  requests only. On parent **create** requests every object with an `id` is connected, since the database updates
  relations only within an update action.

Relations that accept inline writes document their request shape as `<Model>RelationInput`. It holds the id and the
fields of both shapes above, all optional. The shape stays permissive on purpose, since the server strips the properties
that the matched schema does not declare. The service applies the restrictions instead. Fields excluded by the related
model's `create` or `update` config are dropped. A missing required create field fails with a `400` error naming the
field.

Connect, create, and update inputs can be mixed within one list relation request:

```ts
// PUT /api/users/1
{
  posts: [
    5,                                    // connect post 5 by id
    { id: 7, title: 'Renamed' },          // update post 7 inline
    { title: 'Fresh post', slug: 'new' }  // create a new post inline
  ]
}
```

Records without an `id` require `allowCreate: true`. Otherwise, the request fails with a `400` error and the related
record has to be created through its own endpoint first. With `allowCreate` set, a `uniqueKey` matches an existing
record by that field before creating a new one, so the inline create becomes a connect-or-create. Without
`allowCreate` the `uniqueKey` has no effect. Plain connect and inline update always match related records by `id`.

#### Relation output

| Property   | Type                                                 | Description                                                                                                                            |
|------------|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `type`     | `'always'` \| `'single'` \| `'multiple'` \| `'none'` | When to include the relation in output. `always` = all reads, `single` = single record reads, `multiple` = list reads, `none` = never. |
| `include`  | Record\<string, RelationOutput>                      | Nested relation output configuration.                                                                                                  |
| `maxDepth` | number                                               | Levels of a relation pointing back at its own model. Default `1`.                                                                      |
| `count`    | boolean                                              | Include a count of related records.                                                                                                    |

A relation is typed as the related model's `<Model>Single`, so a nested record carries its own relations again and a
self-reference recurses. The schema says what a response can hold, the config how deep one is read.

A relation pointing back at its own model is read one level deep like any other, and `maxDepth` repeats it down the
tree, counting the relation itself as the first level. An `include` naming that same relation replaces the repetition;
any other `include` is applied at every level. Each level is a database join, cheap on a to-one relation such as
`parent` and expensive on a list one such as `children`.

```ts
const config = {
  relations: {
    // A category response carries three levels of ancestors
    parent: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'children',
      owner: true,
      required: false,
      output: { type: 'always', maxDepth: 3 }
    },
    // Kept out of the response, counted as childrenCount instead
    children: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'parent',
      output: { type: 'none', count: true }
    }
  }
}
```

A nested `include` entry carries its own `maxDepth`, applied to the model that entry belongs to:

```ts
// A post reads its category with the breadcrumb above it
const config = {
  category: {
    model: 'Category',
    type: 'oneToMany',
    mappedBy: 'posts',
    owner: true,
    output: {
      type: 'always',
      include: { parent: { type: 'always', maxDepth: 3 } }
    }
  }
}
```

### File fields

```ts
const config = {
  files: {
    photo: {
      mimeType: 'image/*',
      namePattern: 'photos/{userId}-{name}-{hash}.{extension}',
      maxSize: '2 MB',
      image: {
        quality: 80,
        maxWidth: 1200,
        maxHeight: 1200,
        fit: 'inside'
      }
    },
    documents: {
      mimeType: 'application/pdf',
      array: true,
      maxCount: 5
    }
  }
};
```

| Property                | Type                   | Description                                                                                                                                                                                 |
|-------------------------|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mimeType`              | string \| RegExp       | Allowed MIME types (glob patterns like `'image/*'` supported).                                                                                                                              |
| `namePattern`           | string \| function     | File naming pattern or function (available variables are listed below).                                                                                                                     |
| `array`                 | boolean                | Allow multiple files.                                                                                                                                                                       |
| `maxSize`               | number \| string       | Maximum file size (e.g. `'2 MB'`, `5242880`).                                                                                                                                               |
| `maxCount`              | number                 | Maximum number of files (for array fields).                                                                                                                                                 |
| `output`                | RelationOutput         | When to include file info in output, and its count. Takes no `include` or `maxDepth`.                                                                                                       |
| `onResourceDeleted`     | `'delete'` \| `'keep'` | When the owning resource is removed from the database, also by a cascade or an orphan removal. `'delete'` (default) removes files from storage, `'keep'` retains them without serving them. |
| `onResourceSoftDeleted` | `'delete'` \| `'keep'` | When the owning resource is soft deleted (see `softDelete`). `'keep'` (default) retains files for a manual restore without serving them, `'delete'` removes them from storage.              |
| `image`                 | ImageConfig            | Image compression and resize settings. Only applies to image MIME types (excluding GIF).                                                                                                    |

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

#### Image compression

Configure automatic image compression and resizing by adding the `image` property to a file field. Processing only
applies to supported image MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/tiff`. GIF files
are passed through unchanged.

| Property    | Type     | Description                                                                                                    |
|-------------|----------|----------------------------------------------------------------------------------------------------------------|
| `quality`   | number   | Compression quality (1-100). Applies to JPEG, PNG, WebP, AVIF, and TIFF.                                       |
| `width`     | number   | Exact resize width in pixels.                                                                                  |
| `height`    | number   | Exact resize height in pixels.                                                                                 |
| `maxWidth`  | number   | Maximum width. Only downscales if the image exceeds this dimension.                                            |
| `maxHeight` | number   | Maximum height. Only downscales if the image exceeds this dimension.                                           |
| `fit`       | ImageFit | How the image fits the target dimensions: `'inside'` (default), `'contain'`, `'cover'`, `'fill'`, `'outside'`. |

`width`/`height` take precedence over `maxWidth`/`maxHeight`. When using `maxWidth`/`maxHeight`, images smaller than the
specified dimensions are not enlarged.

```ts
// Compress and limit dimensions
const config = {
  files: {
    avatar: {
      mimeType: 'image/*',
      maxSize: '5 MB',
      image: { quality: 80, maxWidth: 800, maxHeight: 800 }
    }
  }
};
```

```ts
// Exact resize for thumbnails
const config = {
  files: {
    thumbnail: {
      mimeType: 'image/jpeg',
      image: { quality: 70, width: 200, height: 200, fit: 'inside' }
    }
  }
}
```

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

Virtual output values are applied automatically to responses of resource CRUD routes (including nested relation and file
objects) and to responses of custom `registerRoute` routes whose 2xx response schemas reference resource output models.
To apply them manually on a raw resource object (e.g. one fetched directly through a Prisma client), use the
`projectVirtualFields` helper:

```ts
import { projectVirtualFields } from '@appweaver/core';

const projected = projectVirtualFields(post, 'Post'); // sets virtual values, recursing into relations and files
```

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
    internalNotes: {
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

A `string` `mapValue` names the field to read the column value from. On a relation or file field it is read off the
related record (and off every item for array relations, joined with `,`); on a scalar field it is read off the exported
record itself. A function `mapValue` receives the field value (or each item of an array field) and returns the column
value.

Hidden fields and virtual fields with `output: { type: 'none' }` are never exported, nested in a relation either. A
relation without a `mapValue` writes one column per field of the related record.

### Index config

Define database indexes as a flat array (single-field indexes) or nested arrays (composite indexes):

```ts
index: ['title']                          // Single-field index on title
index: [['status', 'categoryId']]         // Composite index on status + categoryId
index: ['email', ['status', 'createdAt']] // Both single and composite
```

Prefix a field name with `-` for a descending index or `+` for an ascending one. Without a prefix the database default
order is used:

```ts
index: ['-createdAt']                       // @@index(createdAt(sort: Desc))
index: ['+title']                           // @@index(title(sort: Asc))
index: [['status', '-createdAt']]           // @@index([status, createdAt(sort: Desc)])
```

The prefix is part of the index identity, so `['createdAt', '-createdAt']` emits two separate indexes.

Every foreign key column (relation `<name>Id` columns, `createdById` and `deletedById`) is indexed automatically, since
PostgreSQL and SQLite do not index them on their own. A foreign key is skipped when it is already unique (`oneToOne`
relations and file fields) or when an explicit `index` or `unique` entry leads with it, so
`index: [['categoryId', '-publishedAt']]` replaces the automatic `@@index([categoryId])`. Set `index: false` on a
relation to leave its foreign key unindexed, i.e. for a rarely queried relation of a write-heavy model:

```ts
relations: {
  author: { model: 'User', type: 'oneToMany', owner: true, index: false }
}
```

The audit columns `createdById` and `deletedById` are always indexed.

### Unique config

`unique` takes the same shape as `index` and emits `@@unique` constraints. Use it for a combination of columns that must
be unique together; a single column is better marked with the scalar's own `unique: true`:

```ts
unique: [['provider', 'providerAccountId']] // @@unique([provider, providerAccountId])
```

A create or update breaking the constraint fails in the database, so handle the conflict where concurrent writes can
race to insert the same combination.

### Generated models

`createModel` produces the following TypeBox schema models used internally by routes and services:

| Model                  | Purpose                                        |
|------------------------|------------------------------------------------|
| `readModel`            | Full model with all visible fields             |
| `createModel`          | Request body for create operations             |
| `updateModel`          | Request body for update operations             |
| `relationsModel`       | Relations-only subset                          |
| `virtualModel`         | Virtual fields-only subset                     |
| `filesModel`           | File fields-only subset                        |
| `readOneModel`         | Response for single-item reads                 |
| `readManyModel`        | Response for list reads                        |
| `readOneNullableModel` | `readOneModel` or null, for optional relations |
| `createOneModel`       | Request for create endpoint                    |
| `updateOneModel`       | Request for update endpoint                    |
| `fileUploadModel`      | Request for file upload endpoint               |
| `fileDeleteModel`      | Request for file delete endpoint               |

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
| `beforeQuery`     | `(filter, page, size, sort, cursor, totalCount) => void`                 | Hook called before querying resources. `sort` is a field list string or a sort object.                                          |
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

| Method      | Signature                                                                                         | Description                                                                                                                                |
|-------------|---------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `find`      | `(id) => Promise<ReadOne>`                                                                        | Find a single resource by ID.                                                                                                              |
| `query`     | `(filter?, page?, size?, sort?, cursor?, totalCount?) => Promise<QueryResponse>`                  | Query resources with filtering, pagination, and sorting (see [Query sorting](#query-sorting) and [Cursor pagination](#cursor-pagination)). |
| `aggregate` | `(filter?, select?, dateField?, from?, to?, step?, safeIncrement?) => Promise<AggregateResponse>` | Aggregate resources with time-series grouping (see [Aggregate selection](#aggregate-selection)).                                           |
| `create`    | `(data) => Promise<ReadOne>`                                                                      | Create a new resource.                                                                                                                     |
| `update`    | `(id, data) => Promise<ReadOne>`                                                                  | Update an existing resource.                                                                                                               |
| `delete`    | `(id) => Promise<ReadOne>`                                                                        | Delete a resource.                                                                                                                         |
| `client`    | `ResourceClient` (property)                                                                       | Database client of the model, for operations outside the model contract.                                                                   |

### Typed service injection

`weaver generate` emits a `<Model>ResourceService` alias per model, so `injectService` needs no hand-written type:

```ts
import { injectService } from '@appweaver/core';
import { PostResourceService } from '@/types/generated';

const posts = injectService<PostResourceService>('Post');
```

The alias is `IResourceService<<Model>, <Model>Multiple, <Model>Create, <Model>Update, <Model>Query>`, so the
`<Model>Query`, `<Model>Sort`, and `<Model>Aggregate` aliases are exactly the inputs its methods accept.

The `create` and `update` inputs are the model's declared contracts, so a field an operation config omits, a hidden
scalar, or a relation with `input: { type: 'none' }` is deliberately not part of them. A write outside the contract
belongs on `service.client`, the database client of the model.

### Query filters

The `filter` argument of `query`, `aggregate`, and `export` mirrors the WHERE part of a database query. The matching
`POST /query`, `POST /aggregate`, and `POST /export` routes accept the same structure, validated against a generated
per-model `<Model>QueryFilter` schema that strips unknown and hidden fields.

**Logical operators** (filter level) — take a single filter object (each entry becomes one condition) or a list of them:

| Operator | Description                               |
|----------|-------------------------------------------|
| `_and`   | All nested conditions must match.         |
| `_or`    | At least one nested condition must match. |
| `_not`   | No nested condition may match.            |
| `_nor`   | Alias of `_not`.                          |

**Comparison operators** (field level) — combined inside one object, all must match:

| Operator                        | Description                                                                                                                  |
|---------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `_eq`                           | Equal to the given value.                                                                                                    |
| `_ne`                           | Not equal to the given value.                                                                                                |
| `_gt`, `_gte`, `_lt`, `_lte`    | Greater/lower than (or equal to) the given value.                                                                            |
| `_in`, `_nin`                   | Included / not included in the given list.                                                                                   |
| `_between`                      | Inside the inclusive `[min, max]` range.                                                                                     |
| `_like`                         | SQL LIKE pattern with `%` wildcards (`Luk%` → starts with, `%avatar%` → contains, `%png` → ends with, no wildcard → equals). |
| `_ilike`                        | Case-insensitive `_like` (uses `mode: 'insensitive'`, PostgreSQL and MongoDB only).                                          |
| `_starts`, `_ends`, `_contains` | Starts with / ends with / contains the given string.                                                                         |
| `_exists`                       | Not null (`true`) or null (`false`).                                                                                         |
| `_not`                          | Negates a nested operator object or plain value.                                                                             |

**List (array scalar) operators**: `_has`, `_hasSome`, `_hasEvery`, `_isEmpty`.

**Relation operators**: `_some`, `_every`, `_none` take a filter of the related model; `_exists` maps to an `is`/`isNot`
null check on a single relation and to `some`/`none` on a list relation.

**Plain value shorthands**: a bare value matches by equality, a list by inclusion, a two-value list on a numeric or date
field as an inclusive range, a value or list on a relation by id, an array field uses `has`/`hasSome`, and `null`
matches missing values or related records.

```json
{
  "filter": {
    "_and": {
      "firstName": {
        "_eq": "Luka",
        "_exists": true
      },
      "avatar": {
        "_or": {
          "title": {
            "_eq": "New user avatar"
          },
          "description": {
            "_like": "%avatar%"
          }
        },
        "originalName": {
          "_eq": "new_user_avatar.png"
        }
      }
    },
    "_or": [
      {
        "firstName": {
          "_like": "Luk%"
        }
      },
      {
        "lastName": "Matošević"
      }
    ],
    "tags": {
      "_some": {
        "name": {
          "_contains": "news"
        }
      }
    }
  },
  "page": 1,
  "size": 50,
  "sort": "-createdAt",
  "totalCount": true
}
```

The `QueryFilter<T>` type from `@appweaver/common` provides code completion, and `weaver generate` emits a
`<Model>Query = QueryFilter<Model>` alias per model:

```ts
import { QueryFilter } from '@appweaver/common';
import { User, UserQuery } from '@/types/generated';

const filter: UserQuery = {
  _and: {
    firstName: { _eq: 'Luka' },
    loginAt: { _exists: true }
  }
};
const users = await userService.query(filter);
```

### Query sorting

The `sort` argument of `query` and `export` (and the `sort` property of the `POST /query` and `POST /export` request
bodies) accepts two interchangeable forms, both applying their fields in the declared order:

```json
{
  "sort": "-author.createdAt,tagsCount,id"
}
```

```json
{
  "sort": {
    "author": {
      "createdAt": "desc"
    },
    "tagsCount": "asc",
    "id": "asc"
  }
}
```

In the string form a `-` prefix sorts descending (`+` or no prefix ascending) and a dot notation path targets a relation
field. In the object form a relation takes a nested object, and the only accepted directions are the lower case `asc`
and `desc`.

| Field                  | String form         | Object form                         | Notes                                                                                  |
|------------------------|---------------------|-------------------------------------|----------------------------------------------------------------------------------------|
| Scalar, `id`, audit    | `title`, `-id`      | `{ title: 'asc' }`                  | Hidden scalars, array scalars, and virtual fields cannot be sorted by.                 |
| To-one relation field  | `-author.createdAt` | `{ author: { createdAt: 'desc' } }` | The relation must be included in the response of the action, at any nesting depth.     |
| To-many relation count | `-tagsCount`        | `{ tagsCount: 'desc' }`             | Sorts by the number of related records; the relation name alone (`-tags`) is an alias. |

Anything else — a relation the action does not include, a field of a to-many relation, a hidden or virtual field, an
unknown sort direction — is rejected with a `400` error naming the offending field instead of reaching the database.
Over HTTP the sort object is additionally validated against a generated per-model `<Model>QuerySort` schema, which
strips unknown fields the same way the query filter schema does.

The default sort is `-createdAt`. Every sort is terminated with the primary key when it does not already order by one,
so paging stays deterministic, and the `createdAt` entry is dropped for models configured with
`audit: { createdAt: false }`.

Sort inputs are typed by `QuerySort<T>` from `@appweaver/common`, and `weaver generate` emits a
`<Model>Sort = QuerySort<<Model>Multiple>` alias per model, built from the query output model so it only offers the
relations a query response includes:

```ts
import { PostSort } from '@/types/generated';

const sort: PostSort = { author: { lastName: 'asc' }, createdAt: 'desc' };
const posts = await postService.query({}, 1, 50, sort);
```

### Query response

```ts
const config = {
  resultCount: 50,   // Items in this page
  totalCount: 123,   // Total items matching filter, omitted when totalCount is false
  nextCursor: '...', // Cursor of the following page, absent on the last page
  prevCursor: '...', // Cursor of the preceding page, absent on the first page
  items: []          // Page data
};
```

### Cursor pagination

The response returns a `nextCursor` and a `prevCursor`; send one back as `cursor` to get that page. The direction is
part of the cursor, so a request never names one. A cursor takes precedence over `page` and does not slow down on the
later pages.

```ts
// First page counted, the following ones skipping the count
let result = await postService.query({}, 1, 50);

while (result.nextCursor) {
  result = await postService.query({}, 1, 50, undefined, result.nextCursor, false);
}
```

```json5
// POST /posts/query
{
  "filter": {
    "enabled": true
  },
  "size": 50,
  "sort": "-createdAt",
  "cursor": "eyJpIjo0MiwiZiI6IkhkQjVfa2VMTVlyNyJ9",
  "totalCount": false
}
```

`totalCount` defaults to `true` and scans every matching record, so count once and send `false` afterward, which returns
it as `null`.

A cursor is opaque and bound to the query that issued it: reusing one under a different resource, filter, or sort is
rejected with a 400.

### Aggregate selection

The `select` argument of `aggregate` (and the required `select` property of the `POST /aggregate` request body) holds
the operators to apply per field. Only the fields the database can aggregate are accepted, which are the numeric and
date scalars of the model together with its numeric `id` and audit fields:

| Field kind                         | Operators                                            |
|------------------------------------|------------------------------------------------------|
| Numeric (`int`, `bigInt`, `float`) | `count`, `sum`, `avg`, `min`, `max`, `first`, `last` |
| Date (`dateTime`)                  | `count`, `min`, `max`, `first`, `last`               |

```json
{
  "select": {
    "counter": {
      "count": true,
      "sum": true,
      "avg": true,
      "first": true,
      "last": true
    },
    "publishedAt": {
      "min": true,
      "max": true
    }
  },
  "dateField": "createdAt",
  "from": "2026-01-01T00:00:00.000Z",
  "to": "2026-01-08T00:00:00.000Z"
}
```

**`first` and `last`** take the value held by the earliest and the latest record of a period, ordered by the aggregated
`dateField` (ties broken by `id`), or `null` for a period holding no record. The database cannot aggregate them, so each
non-empty period requesting them costs up to two extra queries.

Any other field, an operator its field kind does not support, and an empty selection are rejected with a `400` error.
Over HTTP the selection is also validated against a generated per-model `<Model>AggregateSelect` schema. The `dateField`
must be a date field of the model (`createdAt` by default).

Selections are typed by `AggregateSelect<T>` from `@appweaver/common`, with a `<Model>Aggregate` alias emitted per
model:

```ts
import { PostAggregate } from '@/types/generated';

const select: PostAggregate = { counter: { sum: true }, createdAt: { max: true } };
const stats = await postService.aggregate({}, select);
```

`aggregate` infers the response type from the selection it is given, so a selection passed as an object literal, or
declared with `satisfies`, narrows the response to the fields it names, while one annotated as `<Model>Aggregate` keeps
every aggregatable field of the model:

```ts
const narrow = await postService.aggregate({}, { counter: { sum: true } });
narrow.total.counter?.sum; // typed
narrow.total.createdAt;    // compile error, the field was not selected

const select = { counter: { sum: true } } satisfies PostAggregate; // narrows and checks against the model
const wide: PostAggregate = { counter: { sum: true } };            // keeps the whole model in the response type
```

### Aggregate response

The response shape follows whatever was selected, and its type carries the fields of the selection (see
[Aggregate selection](#aggregate-selection)). Each aggregated field holds one property per operator applied to it, and
the operators the selection left out are `undefined`:

```ts
const resp = {
  total: AggregateValue,        // Overall aggregation
  items: Array<AggregateResult> // Per-period results
};

// Each AggregateResult:
const result = {
  date: 'Date',
  result: {
    [field]: {
      count: 123,
      min: 123,   // an ISO date string for a date field
      max: 123,   // an ISO date string for a date field
      avg: 123,   // numeric fields only
      sum: 123,   // numeric fields only
      first: 123, // value of the earliest record of the period
      last: 123   // value of the latest record of the period
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
  checkAccess: (user, resource, action) => resource.status === 'Draft',
  readRestrictions: (user, resource, action) => ({
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

| Property            | Type                                  | Description                                                                                                               |
|---------------------|---------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `modelName`         | string                                | Model name to bind this policy to (required).                                                                             |
| `checkAccess`       | `(user, resource, action) => boolean` | Dynamic access check against a resource instance. Return `true` to allow, `false` to deny.                                |
| `readRestrictions`  | `(user, resource, action) => filter`  | Returns a Prisma filter object applied to all read queries (find, query, aggregate). Restricts which records are visible. |
| `writeRestrictions` | `(user, resource, action) => data`    | Returns data to merge or validate on create/update operations.                                                            |
| `files`             | Record\<string, FilePolicy>           | Per-file field access policy.                                                                                             |

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
import { Nullable } from '@appweaver/common';
import { Type } from '@sinclair/typebox';

registerModel(
  Type.Object(
    {
      id: Type.Integer(),
      title: Type.String({ example: 'My Title' }),
      description: Nullable(Type.String({ maxLength: 512 })),
      score: Type.Number({ minimum: 0, maximum: 1 })
    },
    { $id: 'SearchResult' } // The prefered way for naming the model
  ),
  'SearchResult' // Model name can be overriden as a second optional argument
);
```

| Parameter | Type    | Description                                                  |
|-----------|---------|--------------------------------------------------------------|
| `schema`  | TObject | TypeBox object schema definition.                            |
| `name`    | string? | Override schema name identifier for `Type.Ref()` references. |

---

## registerPlugin

Registers a custom Fastify plugin. Plugins are wrapped with `fastify-plugin` so their decorators and hooks are scoped to
the entire server instance.

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
