# Storage

The storage module handles file persistence: storing, streaming, and deleting binary content. The default implementation
(`FilesystemStorage`, provider `local`) writes files to a local directory using a configurable name pattern; a module
of another driver (i.e. a cloud storage, see [modules](./modules.md)) replaces it once enabled. The module supports
range-based streaming for efficient large-file delivery (e.g., video, audio).

## Injecting Storage

```ts
import { inject } from '@appweaver/core';
import { Storage } from '@appweaver/common';

const storage = inject(Storage);
```

---

#### `storage.store(fileName, data, options?)`

Persists a readable stream under the given file name. Returns the stored file's path/ID (derived from
`STORAGE_NAME_PATTERN`), or `null` on failure.

| Parameter  | Type           | Description                                                                                     |
| ---------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `fileName` | `string`       | Original file name (used for name pattern)                                                      |
| `data`     | `Readable`     | Node.js readable stream with the content                                                        |
| `options`  | `StoreOptions` | `{ contentType?, size? }`, the MIME type and the byte size, kept as metadata by a cloud storage |

```ts
import { createReadStream } from 'node:fs';

const fileId = await storage.store(
  'avatar.png',
  createReadStream('/tmp/upload.png')
);
// fileId e.g. "avatar-a3f8bc12.png"
```

**From a multipart upload (Fastify example):**

```ts
const upload = await req.file();
const fileId = await storage.store(upload.filename, upload.file, {
  contentType: upload.mimetype
});
```

#### `storage.url(fileName, options?)`

Returns a URL the clients download the file from directly, i.e. a signed URL of a cloud storage valid for
`options.expiresIn` milliseconds, or `null` (the default, and the `local` storage) to stream the file through the
server. The files route redirects (`302`) to the URL when there is one.

---

#### `storage.stream(fileName, start, end?)`

Returns a `ContentStream` for the stored file, or `null` if the file does not exist. Supports range requests.

| Parameter  | Type     | Description                                |
| ---------- | -------- | ------------------------------------------ |
| `fileName` | `string` | File ID returned by `store`                |
| `start`    | `number` | Byte offset to start reading from          |
| `end`      | `number` | Byte offset to stop reading at (inclusive) |

```ts
type ContentStream = {
  stream: Readable;
  size: number; // total file size in bytes
};
```

**Full file download:**

```ts
const result = await storage.stream('avatar-a3f8bc12.png', 0);
if (!result) throw new Error('File not found');

reply.header('Content-Length', result.size);
reply.send(result.stream);
```

**Range request (e.g., video seeking):**

```ts
const { start, end } = parseRangeHeader(req.headers.range, fileSize);
const result = await storage.stream(fileId, start, end);

reply
  .status(206)
  .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
  .send(result.stream);
```

---

#### `storage.exists(fileName)`

Returns `true` if the file exists in storage.

```ts
if (await storage.exists('avatar-a3f8bc12.png')) {
  // safe to stream
}
```

---

#### `storage.delete(fileName)`

Deletes the stored file. Returns `true` if the file existed and was removed.

```ts
await storage.delete('avatar-a3f8bc12.png');
```

---

#### `storage.checkHealth()`

Verifies that the storage directory is readable and writable. Returns a `HealthCheckResult`.

---

## File name pattern

Stored files are renamed according to `STORAGE_NAME_PATTERN`. The default pattern is `{name}-{hash}.{extension}`, which
produces collision-resistant names while preserving the original extension.

Available placeholders:

| Placeholder   | Resolved to                 |
| ------------- | --------------------------- |
| `{name}`      | Base name without extension |
| `{hash}`      | Short content hash          |
| `{extension}` | Original file extension     |

Example: storing `photo.jpg` produces `photo-c7d3a1f2.jpg`.

Only the pattern itself may contain directory separators (e.g. `photos/{resourceId}/{name}.{extension}`). Every value
substituted into it — including the uploaded file name — is reduced to a single path segment, so an upload can never
introduce a subdirectory, a `..` traversal or a hidden file.

---

## Serving the files

The file routes (`GET /files/public/*` and `/files/protected/*`) answer the stored type, which is the one the upload
declared, inline, so every file but a PDF is served with a sandboxing content security policy (`default-src 'none'`,
`sandbox`): an HTML page or an SVG image opened directly runs no script on the origin of the API. The file name is
sent as RFC 6266 `filename` and, outside ASCII, `filename*`.

## Reserved paths

`STORAGE_RESERVED_PATHS` (default `['__keys__']`, protecting the default JWT key location) lists paths inside
`STORAGE_PATH` that files can never use. An entry is a directory (blocking everything inside it) or a full file name,
relative to the storage root, and whole segments are matched case-insensitively.

Configured `namePattern`s are validated on startup and abort the start; file paths resolved at upload, stream, or delete
time are rejected with a `400` error.

---

## Configuration

| Key                          | Type       | Default                       | Description                                                                                  |
| ---------------------------- | ---------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `STORAGE_PATH`               | `string`   | `'./storage'`                 | Root directory where files are stored                                                        |
| `STORAGE_RESERVED_PATHS`     | `string[]` | `['__keys__']`                | Paths inside the storage root that files cannot use                                          |
| `STORAGE_NAME_PATTERN`       | `string`   | `'{name}-{hash}.{extension}'` | Template for deriving the stored file name                                                   |
| `STORAGE_CACHE_TTL`          | `int`      | `86400000`                    | Cache TTL for storage responses in milliseconds (24h), also the validity of a storage URL    |
| `STORAGE_FILES_ROUTE_PREFIX` | `string`   | `/files`                      | URL prefix for file access routes.                                                           |
| `STORAGE_PROVIDER`           | `string`   | `'auto'`                      | `auto` (`local` unless another storage driver is enabled), `local`, `none`, or a module path |
| `IMAGE_PROVIDER`             | `string`   | `'auto'`                      | `auto` (`sharp` with `@appweaver/sharp`, otherwise none), `sharp`, `none`, or a module path  |

**`appweaver.json` example:**

```json
{
  "config": {
    "storage": {
      "path": "./uploads",
      "reservedPaths": ["__keys__"],
      "namePattern": "{name}-{hash}.{extension}"
    }
  }
}
```

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import { Storage } from '@appweaver/common';

export class AvatarService {
  private readonly _storage = inject(Storage);

  async upload(
    userId: number,
    stream: Readable,
    originalName: string
  ): Promise<string> {
    const fileId = await this._storage.store(originalName, stream);
    if (!fileId) throw new Error('Upload failed');

    await saveAvatarRecord(userId, fileId);
    return fileId;
  }

  async download(fileId: string): Promise<{ stream: Readable; size: number }> {
    const result = await this._storage.stream(fileId, 0);
    if (!result) throw new Error('File not found');
    return result;
  }

  async remove(fileId: string): Promise<void> {
    await this._storage.delete(fileId);
    await deleteAvatarRecord(fileId);
  }
}
```

---

## FileService usage

The `FileService` provides higher-level file management specifically for **Resource Models**. Unlike the raw `Storage`
module, it automatically manages the database records (`File` entries) and enforces security policies defined on your
models. It is defined with a database and a storage. The `File` model, and the files routes, exist only when a model
declares `files`.

### Image processing

The `image` options of a file field (dimensions, fit, quality) are applied by the `ImageProcessor` contract of
`@appweaver/common`, `supports(mimeType)` and `process(stream, mimeType, config?)`. Its `sharp` driver
(`SharpImageProcessor` of `@appweaver/sharp`, installed by the `data` module of a scaffolded project) is selected when
the package is installed. Without a processor (`IMAGE_PROVIDER=none`, or no `@appweaver/sharp`), the images are stored
as they are uploaded, and the application warns at startup naming the file fields whose `image` options are not applied.

### Injecting FileService

```ts
import { inject } from '@appweaver/core';
import { FileService } from '@appweaver/data';

const fileService = inject(FileService);
```

### Saving a file

When saving a file via `FileService`, you must provide the multipart data, the resource instance it belongs to, and its
`ResourceClient`.

```ts
import { inject, injectService } from '@appweaver/core';
import { FileService } from '@appweaver/data';

export class PostService {
  private readonly _fileService = inject(FileService);
  private readonly _postService = injectService('Post');

  async uploadImage(postId: number, data: MultipartFile) {
    const post = await this._postService.find(postId);

    // saveFile stores the file in Storage AND creates a File record in the DB
    // linked to the file field named by the multipart field of the 'post' resource.
    const file = await this._fileService.saveFile(
      data,
      post,
      this._postService.client
    );

    return file;
  }
}
```

### Saving an in-memory file

`saveBuffer()` stores a file that did not arrive as a multipart upload — a downloaded avatar, a generated report, a
thumbnail. It behaves exactly like `saveFile()` (media type check, size limit, name pattern, image processing,
checksum, `File` record), except the content comes from a buffer and the target file field is named explicitly:

```ts
import { inject, injectService } from '@appweaver/core';
import { FileService } from '@appweaver/data';

const users = injectService('User');
const user = await users.find(userId);

const file = await inject(FileService).saveBuffer(
  'avatar', // the file field of the User model
  { name: 'avatar.png', mimeType: 'image/png', data: buffer },
  user,
  users.client
);
```

The optional `size` (defaults to the buffer length) is what the size limit is checked against, and `encoding` defaults
to `7bit`. The owning resource must already exist — to attach files while a user is registering, use the
[`registrationFiles`](./security.md) callback of `createAuthService`.

### File integrity (checksum)

When a file is uploaded through `FileService.saveFile()` (or the resource file upload routes), a **SHA-256 checksum**
(hex-encoded) of the stored content is calculated during the upload and persisted on the `File` record in the
`checksum` field. The checksum is calculated over the exact bytes written to storage (i.e., after any configured image
processing), so it can be used at any later point to verify that the file on disk has not been modified or corrupted.

The checksum is included in file API responses, so clients can verify downloaded content against it.

To verify a file's integrity, recalculate the checksum with the `makeHash` utility from `@appweaver/common` and compare
it with the stored value:

```ts
import { createReadStream } from 'node:fs';
import { makeHash } from '@appweaver/common';

// From a readable stream (no memory buffering, works for large files) — returns a promise
const checksum = await makeHash(createReadStream('/path/to/stored/file'));

// Or from a Buffer / string — returns the hash synchronously
// const checksum = makeHash(downloadedBuffer);

if (checksum !== file.checksum) {
  throw new Error(`File ${file.name} has been modified or corrupted`);
}
```

Stored file checksums always use the defaults: **`sha256` + `hex`**.

### Streaming a file

`FileService.stream()` handles authorization checks (public, private, or protected) and range-based requests
automatically. `FileService.download()` authorizes the same way and returns the `{ url, fileName, mimeType }` of the
storage URL when `storage.url()` gives one, otherwise the stream, which the files route answers with a `302` redirect
or the content.

```ts
// Streams a file while checking if the current user has access
const fileStream = await fileService.stream(
  'photo-c7d3a1f2.jpg',
  req.headers.range
);

reply
  .status(fileStream.start > 0 ? 206 : 200)
  .header('Content-Type', fileStream.mimeType)
  .header(
    'Content-Disposition',
    `attachment; filename="${fileStream.fileName}"`
  )
  .send(fileStream.content.stream);
```

### Deleting a file

Deleting a file via `FileService` removes it from both the storage backend and the database.

```ts
await fileService.deleteFile(
  'photo-c7d3a1f2.jpg',
  'image', // resource field name
  post, // resource instance
  postClient // ResourceClient
);
```

### Deleting all files on resource deletion

When a resource is deleted, its stored files are cleaned up automatically, as configured per file field:

| Option                  | Applies to                                   | Default    |
| ----------------------- | -------------------------------------------- | ---------- |
| `onResourceDeleted`     | A resource removed from the database         | `'delete'` |
| `onResourceSoftDeleted` | A soft deleted resource (model `softDelete`) | `'keep'`   |

Both options behave the same way:

- `'delete'` removes the file from the storage and its `File` row from the database.
- `'keep'` retains the file in the storage and its `File` row in the database, e.g. for audit, but never serves it
  again: the row is soft deleted with the same `deletedAt` and `deletedById` values as its resource, and downloads
  respond with 404 whatever the file access type is.

The resource service `delete` method removes them once the delete commits, whether it is called by the delete route or
directly from code, together with the files of every record deleted with it through an `onDelete: 'cascade'` relation.
The same happens to the orphans an `update` deletes through a relation with `orphanRemoval: true`.

The kept files are marked in the same transaction as the delete, while the removed ones leave the storage once it
commits. A model with `softDelete` enabled keeps the files of its deleted records by default, so a manual restore loses
nothing; set `onResourceSoftDeleted: 'delete'` on a field to remove its files on a soft delete too.

The framework never removes kept files by itself. Purging them after a retention period is up to the application, e.g.
with a scheduled job removing the `File` rows with an old `deletedAt` and their stored files.

```ts
const config = {
  files: {
    coverImage: {
      mimeType: 'image/*',
      onResourceDeleted: 'delete' // default: files removed when resource is deleted
    },
    documents: {
      array: true,
      onResourceDeleted: 'keep' // opt out: files are retained, but no longer served
    },
    idScan: {
      onResourceSoftDeleted: 'delete' // also removed when the resource is soft deleted
    }
  }
};
```

You can also call `deleteResourceFiles` manually if needed, or `deleteResourcesFiles` for many records of one model:

```ts
await fileService.deleteResourceFiles('Post', postId);
await fileService.deleteResourcesFiles('Post', [firstId, secondId]);
```

### File versions

With `storage.versions.enabled` (off by default, see the `STORAGE_VERSIONS_*` keys of
[configuration.md](./configuration.md)), uploading a file again keeps the replaced file as a previous version instead of
deleting it. Each version is a `File` row and a stored object of its own: `version` numbers them from 1, `supersededAt`
is set on the previous ones, and `lineageId` refers every later version to the first one. The current version is always
the newest one, the one linked to the resource.

```ts
const config = {
  files: {
    contract: { mimeType: 'application/pdf' }, // the config: 10 versions, kept forever
    gallery: { array: true, versions: { maxCount: 3, maxAge: '30d' } },
    avatar: { versions: false } // replaced and deleted as without versions
  }
};
```

- **Upload**: a single file field always creates a new version. An array field creates one only for a file named by a
  `<field>:replace` text part sent before the file (`{ file, replace }` in `uploadFiles` of the client), any other
  file being a new file of its own. A replace naming no current file of the field fails with
  `FILE_REPLACE_TARGET_INVALID`, and with `FILE_VERSIONING_DISABLED` on a field without versions. A replace does not
  count against `maxCount` of an array field. A failed upload restores the files it replaced.

  ```
  --boundary
  Content-Disposition: form-data; name="gallery:replace"

  gallery/a-1f2e.png
  --boundary
  Content-Disposition: form-data; name="gallery"; filename="a.png"
  ```

- **Download**: a previous version is served only by the name of the current file and its number,
  `GET /files/public/<current name>?version=2`. The name of a previous version answers `FILE_NOT_FOUND`, so an old URL
  stops working once its file is replaced, as without versions. The file policy applies to every version. A version
  that does not exist answers `FILE_VERSION_NOT_FOUND`, and a version of a field without versions
  `FILE_VERSIONING_DISABLED`.
- **List**: `GET /<resource>/:id/file-versions?name=<current name>` lists the versions newest first, the `url` of a
  previous version being the URL of the current file with its `version`.
- **Delete a version**: `POST /<resource>/:id/delete-file-versions` with
  `{ "<field>": { "name": "<current name>", "version": 2 } }` (or a list of them). Deleting the current version
  (`"latest"`, or its number) makes the previous version current again, linked to the resource, or deletes the file
  without one. The route inherits the config of `fileDelete`, and runs the `canDelete` of the file policy on the version.
- **Delete the file**: `delete-files`, `deleteFile` and the deletion of the resource delete the file with all its
  versions.
- **Retention**: `maxCount` (default `10`, the current version included, `0` for no limit) is applied after every
  upload, and `maxAge` (a duration since the version was replaced, unlimited by default) hides the older versions and
  deletes them after an upload and every `storage.versions.pruneInterval` (`FileService.pruneExpiredVersions`).

Without `storage.versions.enabled` the routes listing and deleting the versions are not registered, the `version` query
parameter is rejected with `FILE_VERSIONING_DISABLED`, and replacing a file deletes it as before, with any version it
kept. The columns stay in the database.

```ts
const current = await fileService.findByName('gallery/a-9c8d.png');
const previous = await fileService.findVersion(current, 2);
const versions = await fileService.listVersions(current.name, post, postClient);
await fileService.saveBuffer('gallery', buffer, post, postClient, current.name); // a new version of the file
await fileService.deleteVersions(
  { gallery: { name: current.name, version: 'latest' } },
  post,
  postClient
);
```

### Owning resource reference

The `File` model records its owner through the `resourceName`, `resourceField` and `resourceId` columns. `resourceId`
is a text column holding the owning record ID, so files attach to models with either an integer or a string primary
key, and `deleteResourceFiles` accepts an ID of either type.
