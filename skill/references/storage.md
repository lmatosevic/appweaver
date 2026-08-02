# Storage

The storage module handles file persistence: storing, streaming, and deleting binary content. The default implementation
(`FilesystemStorage`) writes files to a local directory using a configurable name pattern. The module supports
range-based streaming for efficient large-file delivery (e.g., video, audio).

## Injecting Storage

```ts
import { inject } from '@appweaver/core';
import { Storage } from '@appweaver/common';

const storage = inject(Storage);
```

---

#### `storage.store(fileName, data)`

Persists a readable stream under the given file name. Returns the stored file's path/ID (derived from
`STORAGE_NAME_PATTERN`), or `null` on failure.

| Parameter  | Type       | Description                                |
|------------|------------|--------------------------------------------|
| `fileName` | `string`   | Original file name (used for name pattern) |
| `data`     | `Readable` | Node.js readable stream with the content   |

```ts
import { createReadStream } from 'node:fs';

const fileId = await storage.store('avatar.png', createReadStream('/tmp/upload.png'));
// fileId e.g. "avatar-a3f8bc12.png"
```

**From a multipart upload (Fastify example):**

```ts
const upload = await req.file();
const fileId = await storage.store(upload.filename, upload.file);
```

---

#### `storage.stream(fileName, start, end?)`

Returns a `ContentStream` for the stored file, or `null` if the file does not exist. Supports range requests.

| Parameter  | Type     | Description                                |
|------------|----------|--------------------------------------------|
| `fileName` | `string` | File ID returned by `store`                |
| `start`    | `number` | Byte offset to start reading from          |
| `end`      | `number` | Byte offset to stop reading at (inclusive) |

```ts
type ContentStream = {
  stream: Readable;
  size: number;     // total file size in bytes
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
|---------------|-----------------------------|
| `{name}`      | Base name without extension |
| `{hash}`      | Short content hash          |
| `{extension}` | Original file extension     |

Example: storing `photo.jpg` produces `photo-c7d3a1f2.jpg`.

Only the pattern itself may contain directory separators (e.g. `photos/{resourceId}/{name}.{extension}`). Every value
substituted into it — including the uploaded file name — is reduced to a single path segment, so an upload can never
introduce a subdirectory, a `..` traversal or a hidden file.

---

## Configuration

| Key                          | Type     | Default                                        | Description                                           |
|------------------------------|----------|------------------------------------------------|-------------------------------------------------------|
| `STORAGE_PATH`               | `string` | `'./storage'`                                  | Root directory where files are stored                 |
| `STORAGE_NAME_PATTERN`       | `string` | `'{name}-{hash}.{extension}'`                  | Template for deriving the stored file name            |
| `STORAGE_CACHE_TTL`          | `int`    | `86400000`                                     | Cache TTL for storage responses in milliseconds (24h) |
| `STORAGE_FILES_ROUTE_PREFIX` | `string` | `/files`                                       | URL prefix for file access routes.                    |
| `STORAGE_PROVIDER`           | `string` | `'@appweaver/core/storage/filesystem-storage'` | Path to the Storage implementation                    |

**`appweaver.json` example:**

```json
{
  "STORAGE_PATH": "./uploads",
  "STORAGE_NAME_PATTERN": "{name}-{hash}.{extension}"
}
```

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import { Storage } from '@appweaver/common';

export class AvatarService {
  private readonly _storage = inject(Storage);

  async upload(userId: number, stream: Readable, originalName: string): Promise<string> {
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
models.

### Injecting FileService

```ts
import { inject } from '@appweaver/core';
import { FileService } from '@appweaver/core/storage';

const fileService = inject(FileService);
```

### Saving a file

When saving a file via `FileService`, you must provide the multipart data, the resource instance it belongs to, and its
`ResourceClient`.

```ts
import { inject, injectService, injectModel } from '@appweaver/core';
import { FileService } from '@appweaver/core/storage';

export class PostService {
  private readonly _fileService = inject(FileService);
  private readonly _postService = injectService('Post');
  private readonly _postClient = injectModel('Post');

  async uploadImage(postId: number, data: MultipartFile) {
    const post = await this._postService.find(postId);

    // saveFile stores the file in Storage AND creates a File record in the DB
    // linked to the 'image' field of the 'post' resource.
    const file = await this._fileService.saveFile(data, post, this._postClient);

    return file;
  }
}
```

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
automatically.

```ts
// Streams a file while checking if the current user has access
const fileStream = await fileService.stream('photo-c7d3a1f2.jpg', req.headers.range);

reply
  .status(fileStream.start > 0 ? 206 : 200)
  .header('Content-Type', fileStream.mimeType)
  .header('Content-Disposition', `attachment; filename="${fileStream.fileName}"`)
  .send(fileStream.content.stream);
```

### Deleting a file

Deleting a file via `FileService` removes it from both the storage backend and the database.

```ts
await fileService.deleteFile(
  'photo-c7d3a1f2.jpg',
  'image', // resource field name
  post,    // resource instance
  postClient // ResourceClient
);
```

### Deleting all files on resource deletion

When a resource is deleted, files belonging to file fields configured with `onResourceDeleted: 'delete'` can be
automatically cleaned up. This is handled by `deleteResourceFiles()`, which is called automatically by the framework's
delete route handler.

To enable automatic file cleanup, set `onResourceDeleted: 'delete'` on the file field in your model config:

```ts
const config = {
  files: {
    coverImage: {
      mimeType: 'image/*',
      onResourceDeleted: 'delete' // default: files removed when resource is deleted
    },
    documents: {
      array: true,
      onResourceDeleted: 'keep' // opt out: files are kept
    }
  }
};
```

You can also call `deleteResourceFiles` manually if needed:

```ts
await fileService.deleteResourceFiles('Post', postId);
```
