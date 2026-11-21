import { PassThrough, Readable, Transform } from 'node:stream';
import {
  ConfigurationError,
  ContentStream,
  Database,
  ErrorCode,
  FileField,
  FilePolicy,
  findReservedStoragePath,
  generateToken,
  ImageProcessor,
  isArray,
  isFunction,
  createLogger,
  LIFECYCLE,
  makeHash,
  OnDestroy,
  OnReady,
  parseDuration,
  Resource,
  ResourceClient,
  ResourceId,
  Storage,
  toResourceId,
  uncapitalize,
  FileError
} from '@appweaver/common';
import {
  storageConfig,
  inject,
  injectModel,
  injectPolicy,
  injectService,
  CacheService,
  currentAuthUser
} from '@appweaver/core';
import { PrismaDatabase } from '../database/prisma-database';
import { toDatabaseError } from '../database/database-error';
import { arePoliciesSkipped } from '../utils/policy-util';
import {
  buildFileUrl,
  deletedResourceFileFields,
  FileVersioning,
  fileVersioning,
  generateFileName,
  isValidMimeType,
  parseRange,
  sizeInBytes
} from '../utils/file-util';
import { fileVersionsConfig } from './file-versions-config';
import { liveRecordFilter } from '../utils/model-util';
import { File } from '../types/generated';
import {
  FileBuffer,
  FileVersionDelete,
  UploadedFile,
  UploadPart
} from '../types/storage';
import {
  afterCommit,
  afterRollback,
  context,
  currentTransaction
} from '@appweaver/core/internal';

const logger = createLogger('storage');

export type FileStream = {
  content: ContentStream;
  fileName: string;
  mimeType: string;
  start: number;
  end: number;
};

/** A file the clients download from the URL of its storage, i.e. a signed URL of a cloud storage. */
export type FileRedirect = {
  url: string;
  fileName: string;
  mimeType: string;
};

/**
 * The content of a file to save, normalized from a multipart upload or an in-memory buffer. The size and the truncation
 * flag are read as functions, since a multipart stream only knows both after it has been fully consumed.
 */
type FileContent = {
  fieldName: string;
  fileName: string;
  mimeType: string;
  encoding: string;
  stream: Readable;
  bytesRead: () => number;
  truncated: () => boolean;
  /** The name of the current file this content is a new version of */
  replace?: string;
};

/** The multipart field naming the file the next file of a file field replaces, `<field>:replace`. */
export const FILE_REPLACE_SUFFIX = ':replace';

export class FileService implements OnReady, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  private readonly _storage = inject(Storage);
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _imageProcessor = inject(ImageProcessor, false);
  /** @internal */
  private _pruneTimer?: NodeJS.Timeout;

  /**
   * Starts deleting the file versions older than the `maxAge` of their field, at once and every
   * `storage.versions.pruneInterval`, when a versioned file field has one.
   */
  public onReady(): void {
    clearInterval(this._pruneTimer);
    this._pruneTimer = undefined;

    if (!fileVersionsConfig.ENABLED || this.expiringFields().length === 0) {
      return;
    }

    const interval = parseDuration(fileVersionsConfig.PRUNE_INTERVAL);
    if (!interval) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `File versions prune interval '${fileVersionsConfig.PRUNE_INTERVAL}' is not a duration, i.e. 1h`
      );
    }

    const run = () =>
      void this.pruneExpiredVersions().catch((error) =>
        logger.error(error, 'Cannot delete the expired file versions')
      );
    this._pruneTimer = setInterval(run, interval * 1000);
    this._pruneTimer.unref();
    run();
  }

  public onDestroy(): void {
    clearInterval(this._pruneTimer);
    this._pruneTimer = undefined;
  }

  /**
   * Searches for a current file by its name from a database. A previous version of a file is found by the name of the
   * current one, with {@link findVersion}.
   *
   * @param {string} fileName - The name of the file to search for.
   * @return {Promise<File>} A promise that resolves to the file object if found.
   * @throws {FileError} Throws an error if the file name is placed under a reserved storage path, if a database error
   * occurs, or if the file is not found.
   */
  public async findByName(fileName: string): Promise<File> {
    this.assertPathNotReserved(fileName);

    let file: File | null;

    try {
      // The files a deleted resource keeps are retained, but no longer served
      file = (await this._db.client().file.findFirst({
        where: {
          name: fileName,
          supersededAt: null,
          ...liveRecordFilter('File')
        }
      })) as File;
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }

    if (!file) {
      throw new FileError(ErrorCode.FileNotFound, 'File does not exist', {
        fileName
      });
    }

    return file;
  }

  /**
   * Streams a file from storage, handling authorization and range-based requests.
   *
   * @param {string} fileName - The name of the file to stream.
   * @param {string} [range] - An optional range header specifying the byte range to stream.
   * @param {number} [version] - The version of the file to stream, the current one by default.
   * @return {Promise<FileStream>} A promise that resolves to a file stream object containing the content, metadata, and
   * range details.
   * @throws {FileError} `FILE_NOT_FOUND` if the file does not exist.
   * @throws {FileError} `FILE_FORBIDDEN` if user access to the file is forbidden.
   * @throws {FileError} `FILE_VERSIONING_DISABLED` for a version of a file field without versions.
   * @throws {FileError} `FILE_VERSION_NOT_FOUND` if the version does not exist.
   * @throws {FileError} `FILE_STORAGE_ERROR` if an error occurs while reading the file from storage.
   */
  public async stream(
    fileName: string,
    range?: string,
    version?: number
  ): Promise<FileStream> {
    return this.streamFile(await this.authorizeRead(fileName, version), range);
  }

  /**
   * Opens a file for a download, handling authorization like {@link stream}: the URL of its storage when the storage
   * serves its files directly, otherwise the stream of the file.
   *
   * @param {string} fileName - The name of the file to download.
   * @param {string} [range] - An optional range header specifying the byte range to stream.
   * @param {number} [version] - The version of the file to download, the current one by default.
   * @return {Promise<FileStream | FileRedirect>} The URL of the file, or its stream.
   * @throws {FileError} The errors of {@link stream}.
   */
  public async download(
    fileName: string,
    range?: string,
    version?: number
  ): Promise<FileStream | FileRedirect> {
    const file = await this.authorizeRead(fileName, version);

    const url = await this._storage.url(file.name, {
      expiresIn: storageConfig.URL_TTL
    });
    if (url) {
      return {
        url,
        fileName: file.name.split('/')[0],
        mimeType: file.mimeType
      };
    }

    return this.streamFile(file, range);
  }

  /**
   * Finds a version of a current file, the current one included, unless it is older than the `maxAge` of its field.
   *
   * @param {File} current - The current file.
   * @param {number | 'latest'} version - The version number, or `latest` for the current one.
   * @return {Promise<File>} The version of the file.
   * @throws {FileError} `FILE_VERSIONING_DISABLED` for a file field without versions.
   * @throws {FileError} `FILE_VERSION_NOT_FOUND` if the version does not exist.
   */
  public async findVersion(
    current: File,
    version: number | 'latest'
  ): Promise<File> {
    const versioning = this.requireVersioning(current);
    if (version === 'latest' || version === current.version) {
      return current;
    }

    const found = (await this.versionsOf(current, versioning)).find(
      (file) => file.version === version
    );
    if (!found) {
      throw new FileError(
        ErrorCode.FileVersionNotFound,
        `Version ${version} of the file does not exist`,
        { fileName: current.name, version }
      );
    }

    return found;
  }

  /**
   * Lists the versions of a current file of a resource, the current one first, each with the URL serving it.
   *
   * @param {string} fileName - The name of the current file.
   * @param {Resource} resource - The resource owning the file.
   * @param {ResourceClient} client - The database client of the resource.
   * @return {Promise<File[]>} The versions, newest first.
   * @throws {FileError} `FILE_NOT_FOUND` if the file does not exist.
   * @throws {FileError} `FILE_FORBIDDEN` if the file belongs to another resource, or reading it is forbidden.
   * @throws {FileError} `FILE_VERSIONING_DISABLED` for a file field without versions.
   */
  public async listVersions(
    fileName: string,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    const current = await this.authorizeRead(fileName);
    this.assertOwnedBy(current, resource, client, 'read');
    const versioning = this.requireVersioning(current);

    return (await this.versionsOf(current, versioning)).map((file) =>
      this.withVersionUrl(file, current)
    );
  }

  /**
   * Deletes versions of the files of a resource. Deleting the current version (`latest`, or its number) makes the
   * previous version the current one, or deletes the file when it has none.
   *
   * @param {Record<string, FileVersionDelete | FileVersionDelete[]>} versions - The versions to delete by file field.
   * @param {Resource} resource - The resource owning the files.
   * @param {ResourceClient} client - The database client of the resource.
   * @return {Promise<File[]>} The deleted versions. Rejects with an error if none could be deleted.
   */
  public async deleteVersions(
    versions: Record<string, FileVersionDelete | FileVersionDelete[]>,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    const entries = Object.entries(versions ?? {}).flatMap(([field, value]) =>
      (isArray(value) ? value : [value]).map((ref) => [field, ref] as const)
    );
    if (entries.length === 0) {
      throw new FileError(
        ErrorCode.FileNoneProvided,
        'No file versions for deletion are provided'
      );
    }

    const deleted: File[] = [];
    const errors: unknown[] = [];

    // One after another, since deleting a current version changes the next one
    for (const [field, ref] of entries) {
      try {
        deleted.push(await this.deleteVersion(field, ref, resource, client));
      } catch (e) {
        errors.push(e);
      }
    }

    if (errors.length > 0 && deleted.length === 0) {
      throw new FileError(
        ErrorCode.FileDeleteFailed,
        `Error while deleting file versions: ${errors.join('\n')}`,
        { errors: errors.map(String) }
      );
    }

    await this._cacheService.invalidateCache(client.name, 'deleteFiles');

    return deleted;
  }

  /**
   * Deletes the versions older than the `maxAge` of their file field, of every versioned file field with one. Runs
   * every `storage.versions.pruneInterval`, and can be called by a task.
   *
   * @param {Date} [now] - The time the ages count back from.
   * @return {Promise<number>} The number of versions deleted.
   */
  public async pruneExpiredVersions(now: Date = new Date()): Promise<number> {
    let count = 0;

    for (const {
      resourceName,
      resourceField,
      maxAge
    } of this.expiringFields()) {
      let expired: File[];
      try {
        expired = (await this._db.client().file.findMany({
          where: {
            resourceName,
            resourceField,
            supersededAt: { lt: new Date(now.getTime() - maxAge * 1000) }
          }
        })) as File[];
      } catch (e) {
        throw toDatabaseError(e, 'File');
      }

      for (const file of expired) {
        if (await this.deleteSafe(file.name)) {
          count++;
        }
      }
    }

    if (count > 0) {
      logger.debug({ count }, 'Expired file versions deleted');
    }

    return count;
  }

  /**
   * Saves a file to storage, validates its properties, and associates it with a specific resource and client. With
   * versions, the file of a single file field, or the current file named by `replace`, becomes its previous version.
   *
   * @param {UploadedFile} data The multipart file object containing the file data, field name, filename, and metadata.
   * @param {Resource} resource The resource object with which the file is being associated.
   * @param {ResourceClient} client The database client responsible for handling the resource.
   * @param {string} [replace] The name of the current file of the field the file is a new version of.
   * @return {Promise<File>} A promise that resolves to the saved file object or rejects with an error if the operation
   * fails.
   * @throws {FileError} Throws an error if file validation, storage, or resource association fails.
   */
  public async saveFile(
    data: UploadedFile,
    resource: Resource,
    client: ResourceClient,
    replace?: string
  ): Promise<File> {
    const file = await this.saveUpload(data, resource, client, replace);
    await this.pruneVersions(file);
    return file;
  }

  /**
   * Saves an in-memory file to storage and associates it with a file field of a specific resource. Behaves exactly like
   * {@link saveFile}, except the content is taken from a buffer instead of a multipart upload, which makes it usable
   * outside a file upload request, for an avatar downloaded from an OAuth2 provider or an image the application
   * generates itself.
   *
   * @param {string} fieldName The file field of the resource the file is saved to.
   * @param {FileBuffer} file The file content, along with its original name and media type.
   * @param {Resource} resource The resource object with which the file is being associated.
   * @param {ResourceClient} client The database client responsible for handling the resource.
   * @param {string} [replace] The name of the current file of the field the file is a new version of.
   * @return {Promise<File>} A promise that resolves to the saved file object or rejects with an error if the operation
   * fails.
   * @throws {FileError} Throws an error if file validation, storage, or resource association fails.
   */
  public async saveBuffer(
    fieldName: string,
    file: FileBuffer,
    resource: Resource,
    client: ResourceClient,
    replace?: string
  ): Promise<File> {
    const size = file.size ?? file.data.length;

    const saved = await this.saveContent(
      {
        fieldName,
        fileName: file.name,
        mimeType: file.mimeType,
        encoding: file.encoding ?? '7bit',
        stream: Readable.from(file.data),
        bytesRead: () => size,
        truncated: () => false,
        replace
      },
      resource,
      client
    );
    await this.pruneVersions(saved);
    return saved;
  }

  /**
   * Saves files received as an asynchronous iterable of multipart data. A `<field>:replace` field part names the
   * current file the next file of the field is a new version of.
   *
   * @param {AsyncIterableIterator<UploadPart>} parts - The asynchronous iterable providing multipart data where each
   * part is expected to represent a file or other data.
   * @param {Resource} resource - The resource associated with the files being saved, providing additional contextual
   * information.
   * @param {ResourceClient} client - The database client responsible for handling resource-related operations, such as
   * database interaction.
   * @return {Promise<File[]>} A promise that resolves to an array of successfully saved files. Rejects with an error
   * if one or more files fail to save.
   */
  public async saveFiles(
    parts: AsyncIterableIterator<UploadPart>,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    const saveActions: Promise<File>[] = [];
    const replaces = new Map<string, string>();
    const replaced = new Set<string>();
    const replaceErrors: FileError[] = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const replace = replaces.get(part.fieldname);
        replaces.delete(part.fieldname);
        saveActions.push(this.saveUpload(part, resource, client, replace));
      } else if (part.fieldname.endsWith(FILE_REPLACE_SUFFIX)) {
        const field = part.fieldname.slice(0, -FILE_REPLACE_SUFFIX.length);
        const name = typeof part.value === 'string' ? part.value : '';
        if (replaces.has(field) || replaced.has(name)) {
          // A file replaced twice would leave one of its new versions behind
          replaceErrors.push(
            new FileError(
              ErrorCode.FileReplaceTargetInvalid,
              `File '${name}' is replaced more than once, or '${field}' names no file to replace it`,
              { fileName: name, field }
            )
          );
        }
        replaces.set(field, name);
        replaced.add(name);
      }
    }

    for (const [field, name] of replaces) {
      replaceErrors.push(
        new FileError(
          ErrorCode.FileReplaceTargetInvalid,
          `No '${field}' file follows the file '${name}' it replaces`,
          { fileName: name, field }
        )
      );
    }

    const saveResults = await Promise.allSettled(saveActions);

    const savedFiles = saveResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    const errors = [
      ...replaceErrors,
      ...saveResults.filter((r) => r.status === 'rejected').map((r) => r.reason)
    ];

    if (errors.length > 0) {
      // Delete all successfully saved files in storage and rows in a database,
      // a new version restoring its previous one
      const deleteActions = savedFiles.map((f) =>
        this.discardSaved(f, resource, client)
      );
      await Promise.all(deleteActions);

      const errorMessage = errors.join('\n');
      throw new FileError(
        ErrorCode.FileUploadFailed,
        `Error while saving files: ${errorMessage}`,
        { errors }
      );
    }

    // Once every file is saved, so a failed upload restores the versions it replaced
    for (const file of savedFiles) {
      await this.pruneVersions(file);
    }

    await this._cacheService.invalidateCache(client.name, 'uploadFiles');

    return savedFiles;
  }

  /**
   * Deletes a file from the storage and database if it meets the specified conditions, with all its previous versions.
   *
   * @param {string} fileName - The name of the file to be deleted.
   * @param {string} fieldName - The field associated with the resource to which the file belongs.
   * @param {Resource} resource - The resource that the file is associated with.
   * @param {ResourceClient} client - The client instance representing the resource's type.
   * @return {Promise<File>} A promise that resolves with the deleted file information upon successful deletion.
   * @throws {FileError} If the file is not associated with the provided resource or client,
   *                     if the current user does not have permission to delete the file,
   *                     if there is an error removing the file from storage,
   *                     or if there is an error deleting the file from the database.
   */
  public async deleteFile(
    fileName: string,
    fieldName: string,
    resource: Resource,
    client: ResourceClient
  ): Promise<File> {
    const currentUser = currentAuthUser();

    const file = await this.findByName(fileName);
    this.assertOwnedBy(file, resource, client, 'delete', fieldName);

    const policy = this.getFilePolicy(file.resourceName, file.resourceField);

    if (
      !arePoliciesSkipped() &&
      (await policy.canDelete?.(currentUser ?? null, resource, file)) === false
    ) {
      throw new FileError(
        ErrorCode.FileForbidden,
        'Deleting file is forbidden',
        { fileName, action: 'delete' }
      );
    }

    const result = await this.deleteStored(fileName);
    if (!result) {
      throw new FileError(
        ErrorCode.FileStorageError,
        'Error deleting file from storage'
      );
    }

    try {
      const deletedFile = (await this._db.client().file.delete({
        where: { name: fileName }
      })) as File;

      deletedFile.url = buildFileUrl(deletedFile);

      logger.debug({ deletedFile }, 'File deleted');

      await this.deletePreviousVersions(deletedFile);

      return deletedFile;
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }
  }

  /**
   * Deletes a list of files associated with a given resource using the provided resource client.
   *
   * @param {Record<string, string | string[]>} fileNames - An object where the keys correspond to file fields and the
   * values are either a string (single file name) or an array of file names to be deleted.
   * @param {Resource} resource - The resource instance associated with the files to be deleted.
   * @param {ResourceClient} client - The resource a client used to handle deletion operations.
   * @return {Promise<File[]>} A promise that resolves to an array of files that were successfully deleted. Rejects with
   * an error if no files could be deleted.
   */
  public async deleteFiles(
    fileNames: Record<string, string | string[]>,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    if (Object.keys(fileNames ?? {}).length === 0) {
      throw new FileError(
        ErrorCode.FileNoneProvided,
        'No files for deletion are provided'
      );
    }

    const deleteActions: Promise<File>[] = [];

    for (const [field, value] of Object.entries(fileNames)) {
      const names = typeof value === 'string' ? [value] : value;
      for (const name of names) {
        deleteActions.push(this.deleteFile(name, field, resource, client));
      }
    }

    const deleteResults = await Promise.allSettled(deleteActions);

    const deletedFiles = deleteResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    const errors = deleteResults
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason);

    if (errors.length > 0 && deletedFiles.length === 0) {
      const errorMessage = errors.join('\n');
      throw new FileError(
        ErrorCode.FileDeleteFailed,
        `Error while deleting files: ${errorMessage}`,
        { errors }
      );
    }

    await this._cacheService.invalidateCache(client.name, 'deleteFiles');

    return deletedFiles;
  }

  /**
   * Deletes all files associated with a resource removed from the database,
   * for the file fields not set to `onResourceDeleted: 'keep'`.
   *
   * @param {string} resourceName - The resource model name.
   * @param {ResourceId} id - The ID of the deleted resource.
   * @return {Promise<File[]>} A promise that resolves to the list of successfully deleted files.
   */
  public async deleteResourceFiles(
    resourceName: string,
    id: ResourceId
  ): Promise<File[]> {
    return this.deleteResourcesFiles(resourceName, [id]);
  }

  /**
   * Deletes all files associated with the given deleted resources of one model from the storage and the database. A
   * resource removed from the database loses the files of every field not set to `onResourceDeleted: 'keep'`, while a
   * soft deleted resource only loses the files of the fields set to `onResourceSoftDeleted: 'delete'`.
   *
   * @param {string} resourceName - The resource model name.
   * @param {ResourceId[]} ids - The IDs of the deleted resources.
   * @param {boolean} [softDeleted=false] - Whether the resources were soft deleted.
   * @return {Promise<File[]>} A promise that resolves to the list of successfully deleted files.
   */
  public async deleteResourcesFiles(
    resourceName: string,
    ids: ResourceId[],
    softDeleted: boolean = false
  ): Promise<File[]> {
    // Owning ids are stored as text, whatever the model primary key type is
    const resourceIds = ids.map(String);

    const resourceModel = injectModel(resourceName, false);
    if (!resourceModel || resourceIds.length === 0) {
      return [];
    }

    const { deleted: deleteFields } = deletedResourceFileFields(
      resourceModel.config.files,
      softDeleted
    );

    if (deleteFields.length === 0) {
      return [];
    }

    let files: File[];
    try {
      files = (await this._db.client().file.findMany({
        where: {
          resourceName,
          resourceId: { in: resourceIds },
          resourceField: { in: deleteFields }
        }
      })) as File[];
    } catch (e) {
      logger.error(
        { resourceName, resourceIds, error: e },
        'Error finding resource files for deletion'
      );
      return [];
    }

    const deletedFiles: File[] = [];
    for (const file of files) {
      const success = await this.deleteSafe(file.name);
      if (success) {
        deletedFiles.push(file);
      } else {
        logger.error(
          { resourceName, resourceId: file.resourceId, fileName: file.name },
          'Failed to delete file'
        );
      }
    }

    if (deletedFiles.length > 0) {
      logger.debug(
        { resourceName, resourceIds, deletedCount: deletedFiles.length },
        'Resource files deleted'
      );
    }

    return deletedFiles;
  }

  /**
   * Finds a file, or a version of it, checking that the current user may read it.
   *
   * @internal
   */
  private async authorizeRead(
    fileName: string,
    version?: number
  ): Promise<File> {
    const identity = currentAuthUser();

    let file = await this.findByName(fileName);
    if (version !== undefined) {
      file = await this.findVersion(file, version);
    }
    if (!file) {
      throw new FileError(ErrorCode.FileNotFound, 'File does not exist', {
        fileName
      });
    }

    const policy = this.getFilePolicy(file.resourceName, file.resourceField);

    if (!identity && policy.accessType !== 'public') {
      throw new FileError(
        ErrorCode.FileForbidden,
        'Public file access is forbidden',
        { fileName, action: 'read' }
      );
    }

    if (policy.accessType === 'private' && identity?.id !== file.createdById) {
      throw new FileError(
        ErrorCode.FileForbidden,
        'Private file access is forbidden',
        { fileName, action: 'read' }
      );
    }

    if (
      policy.accessType == 'protected' &&
      file.resourceName &&
      file.resourceId
    ) {
      const resourceService = injectService(file.resourceName);
      // The owning id is stored as text, so it is converted back to the
      // primary key type of that model before the lookup
      const resource = await resourceService.find(
        toResourceId(
          file.resourceId,
          injectModel(file.resourceName, false)?.config?.id
        )
      );

      if (
        !arePoliciesSkipped() &&
        (await policy.canAccess?.(identity ?? null, resource, file)) === false
      ) {
        throw new FileError(
          ErrorCode.FileForbidden,
          'File access is forbidden',
          { fileName, action: 'read' }
        );
      }
    }

    return file;
  }

  /** @internal */
  private async saveContent(
    data: FileContent,
    resource: Resource,
    client: ResourceClient
  ): Promise<File> {
    const identity = currentAuthUser();

    // Checked against the model rather than the resource object, so a file field
    // kept out of the resource output is still writable
    const fileConfig = this.getFileConfig(client.name, data.fieldName);
    if (!fileConfig) {
      throw new FileError(
        ErrorCode.FileFieldNotFound,
        `File field '${data.fieldName}' does not exist on resource '${client.name}'`,
        { model: client.name, field: data.fieldName }
      );
    }

    const policy = this.getFilePolicy(client.name, data.fieldName);

    if (!isValidMimeType(data.mimeType, fileConfig.mimeType)) {
      throw new FileError(
        ErrorCode.FileUnsupportedType,
        `Unsupported media file type: ${data.mimeType}`,
        { mimeType: data.mimeType }
      );
    }

    const versioning = fileVersioning(fileConfig);
    if (data.replace !== undefined && !versioning) {
      throw new FileError(
        ErrorCode.FileVersioningDisabled,
        `File field '${data.fieldName}' of '${client.name}' keeps no versions`,
        { model: client.name, field: data.fieldName }
      );
    }

    // The current file the new one becomes a version of
    let previous: File | null = null;
    if (versioning) {
      previous = fileConfig.array
        ? data.replace !== undefined
          ? await this.findReplaced(data, resource, client)
          : null
        : await this.currentFile(data.fieldName, resource, client);

      if (
        !fileConfig.array &&
        data.replace !== undefined &&
        previous?.name !== data.replace
      ) {
        throw new FileError(
          ErrorCode.FileReplaceTargetInvalid,
          `File '${data.replace}' is not the '${data.fieldName}' file of the resource`,
          { fileName: data.replace, field: data.fieldName }
        );
      }
    }

    // A new version replaces a file, so the count stays the same
    if (fileConfig.array && !previous) {
      const fileCount = await this.fileCount(
        data.fieldName,
        client.name,
        String(resource.id)
      );
      if (fileConfig.maxCount && fileConfig.maxCount < fileCount + 1) {
        throw new FileError(
          ErrorCode.FileLimitExceeded,
          `Maximum number of files allowed: ${fileConfig.maxCount}`,
          { maxCount: fileConfig.maxCount }
        );
      }
    }

    let pattern: string | undefined;
    if (isFunction(fileConfig.namePattern)) {
      pattern = fileConfig.namePattern(
        {
          fieldName: data.fieldName,
          fileName: data.fileName,
          encoding: data.encoding,
          mimeType: data.mimeType,
          bytesRead: data.bytesRead(),
          truncated: data.truncated()
        },
        resource
      );
    } else {
      pattern = fileConfig.namePattern;
    }

    let generatedName = generateFileName(data.fileName, pattern, {
      resourceField: data.fieldName,
      resourceName: client.name,
      resourceId: resource.id,
      userId: identity?.id,
      userEmail: identity?.email
    });

    // The generated name may come from a name pattern configured as a function,
    // which cannot be validated on startup, so it is checked here as well.
    this.assertPathNotReserved(generatedName);

    let nameRegenCount = 0;
    while (await this._storage.exists(generatedName)) {
      nameRegenCount++;

      if (nameRegenCount === 10) {
        throw new FileError(
          ErrorCode.FileStorageError,
          'Unable to generate unique file name'
        );
      }

      const hash = generateToken('bytes');
      const nameParts = generatedName.split('.');

      if (nameParts.length > 1) {
        const ext = nameParts.pop();
        const base = nameParts.join('.');
        generatedName = `${base}-${hash}.${ext}`;
      } else {
        generatedName = `${nameParts[0]}-${hash}`;
      }
    }

    const createFile = {
      name: generatedName,
      originalName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.bytesRead(),
      resourceField: data.fieldName,
      resourceName: client.name,
      resourceId: String(resource.id),
      version: previous ? previous.version + 1 : 1,
      lineageId: previous ? lineageOf(previous) : undefined,
      createdById: identity?.id
    } as File;

    if (
      !arePoliciesSkipped() &&
      (await policy.canCreate?.(identity ?? null, resource, createFile)) ===
        false
    ) {
      throw new FileError(
        ErrorCode.FileForbidden,
        'Creating file is forbidden',
        { action: 'create' }
      );
    }

    let fileStream: Readable = data.stream;
    if (this._imageProcessor?.supports(data.mimeType)) {
      fileStream = this._imageProcessor.process(
        data.stream,
        data.mimeType,
        fileConfig.image
      );
    }

    // Tee the stream so the checksum and the stored size are calculated over the
    // exact bytes written to storage in a single pass, without buffering the file.
    let storedBytes = 0;
    const storageStream = new Transform({
      transform(chunk, _encoding, callback) {
        storedBytes += chunk.length;
        callback(null, chunk);
      }
    });
    const checksumStream = new PassThrough();

    fileStream.pipe(storageStream);
    fileStream.pipe(checksumStream);

    // pipe() does not forward source errors to destinations, so both branches
    // must be destroyed manually to avoid hanging on a failed upload stream.
    fileStream.on('error', (e) => {
      logger.error(e, 'Error calculating file checksum');
      storageStream.destroy(e);
      checksumStream.destroy(e);
    });

    const [fileName, checksum] = await Promise.all([
      this._storage.store(generatedName, storageStream, {
        contentType: data.mimeType
      }),
      makeHash(checksumStream)
    ]);
    if (!fileName) {
      throw new FileError(
        ErrorCode.FileStorageError,
        'Error saving file to storage'
      );
    }
    afterRollback(() => this._storage.delete(fileName));

    createFile.name = fileName;
    createFile.checksum = checksum;
    // The size of the content in storage, which is the processed one for images
    createFile.sizeBytes = storedBytes;

    // The size limit applies to the received content, whose read size and
    // truncation flag are only known once the stream has been consumed.
    const maxSizeBytes = sizeInBytes(fileConfig.maxSize);
    if (
      data.truncated() ||
      (maxSizeBytes > 0 && data.bytesRead() > maxSizeBytes)
    ) {
      await this._storage.delete(fileName);
      throw new FileError(
        ErrorCode.FileTooLarge,
        `File size exceeded limit of ${maxSizeBytes} bytes`,
        { maxSizeBytes }
      );
    }

    try {
      // Check if a resource already has a file for a single file property and
      // delete it after successfully creating the new one, unless it becomes
      // the previous version of the new one.
      let existingFile: File | null = null;
      if (!fileConfig.array && !versioning) {
        existingFile = await this.currentFile(data.fieldName, resource, client);
      }

      const result = previous
        ? await this.createVersion(
            createFile,
            previous,
            fileConfig,
            resource,
            client
          )
        : await client.update({
            where: { id: resource.id },
            data: {
              [data.fieldName]: {
                create: createFile
              }
            },
            include: { [data.fieldName]: true }
          });

      if (existingFile) {
        await this.deleteSafe(existingFile.name);
        await this.deletePreviousVersions(existingFile);
      }

      let file: File = result[data.fieldName];
      if (isArray(result[data.fieldName])) {
        file = result[data.fieldName].find(
          (f: File) => f.name === createFile.name
        );
      }

      file.url = buildFileUrl(file);

      logger.debug({ file }, 'File saved');

      return file;
    } catch (e) {
      await this.deleteSafe(fileName);
      throw toDatabaseError(e, 'File');
    }
  }

  /**
   * Saves a file of a multipart upload, leaving the versions it replaced to {@link pruneVersions}.
   *
   * @internal
   */
  private async saveUpload(
    data: UploadedFile,
    resource: Resource,
    client: ResourceClient,
    replace?: string
  ): Promise<File> {
    try {
      return await this.saveContent(
        {
          fieldName: data.fieldname,
          fileName: data.filename,
          mimeType: data.mimetype,
          encoding: data.encoding,
          stream: data.file,
          bytesRead: () => data.file.bytesRead,
          truncated: () => data.file.truncated,
          replace
        },
        resource,
        client
      );
    } catch (e) {
      // A file rejected before its content was read is drained, otherwise the
      // multipart parts after it never arrive
      data.file.resume();
      throw e;
    }
  }

  /** @internal */
  private async streamFile(file: File, range?: string): Promise<FileStream> {
    const parsedRange = parseRange(range);
    const start = parsedRange.start;
    let end = parsedRange.end;

    const fileStream = await this._storage.stream(file.name, start, end);
    if (!fileStream) {
      throw new FileError(
        ErrorCode.FileStorageError,
        'Error reading file from storage'
      );
    }

    if (end === undefined || end >= fileStream.size || end >= file.sizeBytes) {
      end = (fileStream.size ?? file.sizeBytes) - 1;
    }

    return {
      content: fileStream,
      fileName: file.name.split('/')[0],
      mimeType: file.mimeType,
      start,
      end
    };
  }

  /**
   * The current file of a single file field of a resource.
   *
   * @internal
   */
  private async currentFile(
    fieldName: string,
    resource: Resource,
    client: ResourceClient
  ): Promise<File | null> {
    const resourceWithFile = await client.findFirst({
      where: { id: resource.id },
      include: { [fieldName]: true }
    });
    return resourceWithFile?.[fieldName] ?? null;
  }

  /**
   * The current file of a file field of the resource the content replaces.
   *
   * @internal
   */
  private async findReplaced(
    data: FileContent,
    resource: Resource,
    client: ResourceClient
  ): Promise<File> {
    let file: File | null;
    try {
      file = (await this._db.client().file.findFirst({
        where: {
          name: data.replace,
          resourceName: client.name,
          resourceId: String(resource.id),
          resourceField: data.fieldName,
          supersededAt: null,
          ...liveRecordFilter('File')
        }
      })) as File | null;
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }

    if (!file) {
      throw new FileError(
        ErrorCode.FileReplaceTargetInvalid,
        `File '${data.replace}' is not a '${data.fieldName}' file of the resource`,
        { fileName: data.replace!, field: data.fieldName }
      );
    }

    return file;
  }

  /**
   * Creates a new version of a file, linked to the resource in place of the previous one, which it supersedes.
   *
   * @internal
   */
  private async createVersion(
    createFile: File,
    previous: File,
    fileConfig: FileField,
    resource: Resource,
    client: ResourceClient
  ): Promise<Record<string, any>> {
    const fieldName = createFile.resourceField!;
    return this._db.transaction(async (tx) => {
      const result = await tx[uncapitalize(client.name)].update({
        where: { id: resource.id },
        data: {
          [fieldName]: fileConfig.array
            ? { create: createFile, disconnect: { id: previous.id } }
            : { create: createFile }
        },
        include: { [fieldName]: true }
      });
      await tx.file.update({
        where: { id: previous.id },
        data: { supersededAt: new Date() }
      });
      return result;
    });
  }

  /**
   * Deletes a version of a file of a resource, the current one making the previous version current.
   *
   * @internal
   */
  private async deleteVersion(
    fieldName: string,
    ref: FileVersionDelete,
    resource: Resource,
    client: ResourceClient
  ): Promise<File> {
    const current = await this.findByName(ref.name);
    this.assertOwnedBy(current, resource, client, 'delete', fieldName);
    const target = await this.findVersion(current, ref.version);

    const policy = this.getFilePolicy(current.resourceName, fieldName);
    if (
      !arePoliciesSkipped() &&
      (await policy.canDelete?.(
        currentAuthUser() ?? null,
        resource,
        target
      )) === false
    ) {
      throw new FileError(
        ErrorCode.FileForbidden,
        'Deleting file is forbidden',
        { fileName: ref.name, action: 'delete' }
      );
    }

    if (target.supersededAt) {
      if (!(await this.deleteStored(target.name))) {
        throw new FileError(
          ErrorCode.FileStorageError,
          'Error deleting file from storage'
        );
      }
      try {
        await this._db.client().file.delete({ where: { id: target.id } });
      } catch (e) {
        throw toDatabaseError(e, 'File');
      }
    } else {
      await this.removeCurrent(current, resource, client);
    }

    logger.debug({ file: target }, 'File version deleted');

    return this.withVersionUrl(target, current);
  }

  /**
   * Deletes the current version of a file, linking its previous version to the resource as the current one.
   *
   * @internal
   */
  private async removeCurrent(
    current: File,
    resource: Resource,
    client: ResourceClient
  ): Promise<void> {
    const fieldName = current.resourceField!;
    const fileConfig = this.getFileConfig(client.name, fieldName);
    const previous = (
      await this.versionsOf(current, fileVersioning(fileConfig))
    ).find((file) => file.supersededAt);

    try {
      await this._db.transaction(async (tx) => {
        if (previous) {
          await tx[uncapitalize(client.name)].update({
            where: { id: resource.id },
            data: {
              [fieldName]: fileConfig?.array
                ? {
                    connect: { id: previous.id },
                    disconnect: { id: current.id }
                  }
                : { connect: { id: previous.id } }
            }
          });
          await tx.file.update({
            where: { id: previous.id },
            data: { supersededAt: null }
          });
        }
        await tx.file.delete({ where: { id: current.id } });
        // Once the transaction commits, so a rollback keeps the content
        await this.deleteStored(current.name);
      });
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }
  }

  /**
   * Deletes a file saved by an upload that failed, a new version restoring its previous one.
   *
   * @internal
   */
  private async discardSaved(
    file: File,
    resource: Resource,
    client: ResourceClient
  ): Promise<boolean> {
    if (file.version <= 1) {
      return this.deleteSafe(file.name);
    }
    try {
      await this.removeCurrent(file, resource, client);
      return true;
    } catch (e) {
      logger.error({ fileName: file.name, error: e }, 'Cannot discard file');
      return false;
    }
  }

  /**
   * Deletes the previous versions of a file, i.e. once the file itself is deleted.
   *
   * @internal
   */
  private async deletePreviousVersions(file: File): Promise<void> {
    if (file.version <= 1) {
      return;
    }

    try {
      for (const version of await this.versionsOf(file)) {
        if (version.id !== file.id && !(await this.deleteSafe(version.name))) {
          logger.error(
            { fileName: version.name },
            'Cannot delete file version'
          );
        }
      }
    } catch (e) {
      logger.error(
        { fileName: file.name, error: e },
        'Cannot delete the versions of the file'
      );
    }
  }

  /**
   * Deletes the versions of a current file beyond the `maxCount` and older than the `maxAge` of its field.
   *
   * @internal
   */
  private async pruneVersions(file: File): Promise<void> {
    const versioning =
      file.version > 1
        ? fileVersioning(
            this.getFileConfig(file.resourceName, file.resourceField)
          )
        : undefined;
    if (!versioning) {
      return;
    }

    const cutoff = versioning.maxAge
      ? Date.now() - versioning.maxAge * 1000
      : undefined;

    try {
      const versions = await this.versionsOf(file);
      // Newest first, the current version at the first index
      const stale = versions.filter(
        (version, index) =>
          version.supersededAt &&
          ((versioning.maxCount > 0 && index >= versioning.maxCount) ||
            (cutoff !== undefined &&
              new Date(version.supersededAt).getTime() < cutoff))
      );
      for (const version of stale) {
        await this.deleteSafe(version.name);
      }
      if (stale.length > 0) {
        logger.debug(
          { fileName: file.name, count: stale.length },
          'File versions pruned'
        );
      }
    } catch (e) {
      logger.error(
        { fileName: file.name, error: e },
        'Cannot prune the versions of the file'
      );
    }
  }

  /**
   * The versions of a current file, newest first, without the ones older than the `maxAge` of a given versioning.
   *
   * @internal
   */
  private async versionsOf(
    current: File,
    versioning?: FileVersioning
  ): Promise<File[]> {
    // The current version is the newest one, so the first one has no others
    if (current.version <= 1) {
      return [current];
    }

    const lineage = lineageOf(current);
    let versions: File[];
    try {
      versions = (await this._db.client().file.findMany({
        where: {
          resourceName: current.resourceName,
          resourceId: current.resourceId,
          resourceField: current.resourceField,
          OR: [
            { lineageId: lineage },
            {
              id: toResourceId(
                lineage,
                injectModel('File', false)?.config?.id
              ) as number
            }
          ],
          ...liveRecordFilter('File')
        },
        orderBy: { version: 'desc' }
      })) as File[];
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }

    const cutoff = versioning?.maxAge
      ? Date.now() - versioning.maxAge * 1000
      : undefined;

    return cutoff === undefined
      ? versions
      : versions.filter(
          (file) =>
            !file.supersededAt ||
            new Date(file.supersededAt).getTime() >= cutoff
        );
  }

  /**
   * The versioning of the field of a file, failing for a field without versions.
   *
   * @internal
   */
  private requireVersioning(file: File): FileVersioning {
    const versioning = fileVersioning(
      this.getFileConfig(file.resourceName, file.resourceField)
    );
    if (!versioning) {
      throw new FileError(
        ErrorCode.FileVersioningDisabled,
        `File field '${file.resourceField}' of '${file.resourceName}' keeps no versions`,
        {
          model: file.resourceName ?? 'File',
          field: file.resourceField ?? undefined
        }
      );
    }
    return versioning;
  }

  /**
   * A version with the URL serving it, the URL of the current file with the `version` of a previous one.
   *
   * @internal
   */
  private withVersionUrl(file: File, current: File): File {
    const url = buildFileUrl(current);
    return {
      ...file,
      url: file.supersededAt ? `${url}?version=${file.version}` : url
    };
  }

  /** @internal */
  private assertOwnedBy(
    file: File,
    resource: Resource,
    client: ResourceClient,
    action: 'read' | 'delete',
    fieldName?: string
  ): void {
    if (
      file.resourceId !== String(resource.id) ||
      file.resourceName !== client.name ||
      (fieldName !== undefined && file.resourceField !== fieldName)
    ) {
      throw new FileError(
        ErrorCode.FileForbidden,
        `File does not belong to a '${client.name}' resource`,
        { fileName: file.name, action }
      );
    }
  }

  /**
   * The versioned file fields of every model whose versions expire.
   *
   * @internal
   */
  private expiringFields(): {
    resourceName: string;
    resourceField: string;
    maxAge: number;
  }[] {
    return [...context.resource.models.values()].flatMap((model) =>
      Object.entries(model.config.files ?? {}).flatMap(([field, config]) => {
        const maxAge = fileVersioning(config)?.maxAge;
        return maxAge
          ? [{ resourceName: model.name, resourceField: field, maxAge }]
          : [];
      })
    );
  }

  /** @internal */
  private assertPathNotReserved(fileName: string): void {
    const reservedPath = findReservedStoragePath(
      fileName,
      storageConfig.RESERVED_PATHS
    );

    if (reservedPath !== null) {
      throw new FileError(
        ErrorCode.FileInvalidPath,
        `File path '${fileName}' is not allowed`,
        { fileName }
      );
    }
  }

  /**
   * Removes a file from storage, or once the current transaction commits, so a
   * rollback cannot leave a database row pointing at a removed file.
   *
   * @internal
   */
  private async deleteStored(fileName: string): Promise<boolean> {
    if (currentTransaction()) {
      afterCommit(() => this._storage.delete(fileName));
      return true;
    }
    return this._storage.delete(fileName);
  }

  /** @internal */
  private async deleteSafe(fileName: string): Promise<boolean> {
    let success = true;

    try {
      const result = await this.deleteStored(fileName);
      if (!result) {
        success = false;
      }
    } catch {
      success = false;
    }

    try {
      await this._db.client().file.delete({
        where: { name: fileName }
      });
    } catch {
      success = false;
    }

    return success;
  }

  /** @internal */
  private async fileCount(
    resourceField: string,
    resourceName: string,
    resourceId: string
  ): Promise<number> {
    try {
      return await this._db.client().file.count({
        where: { resourceField, resourceName, resourceId, supersededAt: null }
      });
    } catch (e) {
      throw toDatabaseError(e, 'File');
    }
  }

  /** Returns undefined when the model has no such file field configured.
   * @internal */
  private getFileConfig(
    resourceName?: string | null,
    resourceField?: string | null
  ): FileField | undefined {
    if (!resourceName || !resourceField) {
      return undefined;
    }

    const config = injectModel(resourceName, false)?.config.files?.[
      resourceField
    ];

    return config ? { ...config } : undefined;
  }

  /** @internal */
  private getFilePolicy(
    resourceName?: string | null,
    resourceField?: string | null
  ): FilePolicy {
    if (!resourceName || !resourceField) {
      return {};
    }

    const policy =
      injectPolicy(resourceName, false)?.files?.[resourceField] ?? {};

    // Without an access type, a file is protected, which also runs the custom
    // access check and the read restrictions of the owning resource
    return { accessType: 'protected', ...policy };
  }
}

/** The id of the first version of a file, which the versions after it refer to. */
function lineageOf(file: File): string {
  return file.lineageId ?? String(file.id);
}
