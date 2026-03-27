# Storage

The storage module handles file persistence: storing, streaming, and deleting binary content. The default
implementation (`FilesystemStorage`) writes files to a local directory using a configurable name pattern. The module
supports range-based streaming for efficient large-file delivery (e.g., video, audio).

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

---

## Configuration

| Key                    | Type     | Default                                        | Description                                           |
|------------------------|----------|------------------------------------------------|-------------------------------------------------------|
| `STORAGE_PATH`         | `string` | `'./storage'`                                  | Root directory where files are stored                 |
| `STORAGE_NAME_PATTERN` | `string` | `'{name}-{hash}.{extension}'`                  | Template for deriving the stored file name            |
| `STORAGE_CACHE_TTL`    | `int`    | `86400000`                                     | Cache TTL for storage responses in milliseconds (24h) |
| `STORAGE_PROVIDER`     | `string` | `'@appweaver/core/storage/filesystem-storage'` | Path to the Storage implementation                    |

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
