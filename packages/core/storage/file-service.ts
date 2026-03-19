import { Multipart, MultipartFile } from '@fastify/multipart';
import {
  ContentStream,
  Database,
  FileField,
  FilePolicy,
  generateToken,
  isArray,
  isFunction,
  logger,
  Storage
} from '@appweaver/common';
import { inject, injectModel, injectPolicy, injectService } from '../context';
import { HttpError } from '../errors';
import { currentAuthUser } from '../security';
import { PrismaDatabase } from '../database';
import {
  generateFileName,
  isValidMimeType,
  parseRange,
  sizeInBytes
} from '../utils';
import { File, Resource, ResourceClient } from '../types';

export type FileStream = {
  content: ContentStream;
  fileName: string;
  mimeType: string;
  start: number;
  end: number;
};

export class FileService {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  private readonly _storage = inject(Storage);

  /**
   * Searches for a file by its name from a database.
   *
   * @param {string} fileName - The name of the file to search for.
   * @return {Promise<File>} A promise that resolves to the file object if found.
   * @throws {HttpError} Throws an error if a database error occurs or if the file is not found.
   */
  public async findByName(fileName: string): Promise<File> {
    let file: File | null;

    try {
      file = (await this._db.client().file.findFirst({
        where: { name: fileName }
      })) as File;
    } catch (e) {
      throw new HttpError(`File read error`, 500, e);
    }

    if (!file) {
      throw new HttpError('File does not exist', 404);
    }

    return file;
  }

  /**
   * Streams a file from storage, handling authorization and range-based requests.
   *
   * @param {string} fileName - The name of the file to stream.
   * @param {string} [range] - An optional range header specifying the byte range to stream.
   * @return {Promise<FileStream>} A promise that resolves to a file stream object containing the content, metadata, and
   * range details.
   * @throws {HttpError} Throws a 404 error if the file does not exist.
   * @throws {HttpError} Throws a 403 error if user access to the file is forbidden.
   * @throws {HttpError} Throws a 500 error if an error occurs while reading the file from storage.
   */
  public async stream(fileName: string, range?: string): Promise<FileStream> {
    const identity = currentAuthUser();

    const file = await this.findByName(fileName);
    if (!file) {
      throw new HttpError('File does not exist', 404);
    }

    const policy = this.getFilePolicy(file.resourceName, file.resourceField);

    if (!identity && policy.accessType !== 'public') {
      throw new HttpError('Public file access is forbidden', 403);
    }

    if (policy.accessType === 'private' && identity?.id !== file.createdById) {
      throw new HttpError('Private file access is forbidden', 403);
    }

    if (
      policy.accessType == 'protected' &&
      file.resourceName &&
      file.resourceId
    ) {
      const resourceService = injectService(file.resourceName);
      const resource = await resourceService.find(file.resourceId);

      if (identity && policy.canAccess?.(identity, resource, file) === false) {
        throw new HttpError('File access is forbidden', 403);
      }
    }

    const parsedRange = parseRange(range);
    const start = parsedRange.start;
    let end = parsedRange.end;

    const fileStream = await this._storage.stream(fileName, start, end);
    if (!fileStream) {
      throw new HttpError('Error reading file from storage', 500);
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
   * Saves a file to storage, validates its properties, and associates it with a specific resource and client.
   *
   * @param {MultipartFile} data The multipart file object containing the file data, field name, filename, and metadata.
   * @param {Resource} resource The resource object with which the file is being associated.
   * @param {ResourceClient} client The database client responsible for handling the resource.
   * @return {Promise<File>} A promise that resolves to the saved file object or rejects with an error if the operation
   * fails.
   * @throws {HttpError} Throws an error if file validation, storage, or resource association fails.
   */
  public async saveFile(
    data: MultipartFile,
    resource: Resource,
    client: ResourceClient
  ): Promise<File> {
    const identity = currentAuthUser();

    if (!(data.fieldname in resource)) {
      throw new HttpError(
        `File field '${data.fieldname}' does not exist on resource '${client.name}'`,
        400
      );
    }

    const config = this.getFileConfig(client.name, data.fieldname);
    const policy = this.getFilePolicy(client.name, data.fieldname);

    if (!isValidMimeType(data.mimetype, config.mimeType)) {
      throw new HttpError(`Unsupported media file type: ${data.mimetype}`, 400);
    }

    if (config.array) {
      const fileCount = await this.fileCount(
        data.fieldname,
        client.name,
        resource.id
      );
      if (config.maxCount && config.maxCount < fileCount + 1) {
        throw new HttpError(
          `Maximum number of files allowed: ${config.maxCount}`,
          400
        );
      }
    }

    let pattern: string | undefined;
    if (isFunction(config.namePattern)) {
      pattern = config.namePattern(data, resource);
    } else {
      pattern = config.namePattern;
    }

    let generatedName = generateFileName(data.filename, pattern, {
      resourceField: data.fieldname,
      resourceName: client.name,
      resourceId: resource.id,
      userId: identity?.id,
      userName: identity?.email
    });

    let nameRegenCount = 0;
    while (await this._storage.exists(generatedName)) {
      nameRegenCount++;

      if (nameRegenCount === 10) {
        throw new HttpError('Unable to generate unique file name', 500);
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
      originalName: data.filename,
      mimeType: data.mimetype,
      sizeBytes: data.file.bytesRead,
      resourceField: data.fieldname,
      resourceName: client.name,
      resourceId: resource.id,
      createdById: identity?.id
    } as File;

    if (
      identity &&
      policy.canCreate?.(identity, resource, createFile) === false
    ) {
      throw new HttpError('Creating file is forbidden', 403);
    }

    const fileName = await this._storage.store(generatedName, data.file);
    if (!fileName) {
      throw new HttpError('Error saving file to storage', 500);
    }

    createFile.name = fileName;

    // File size checks must come after storing a file due to bytesRead and
    // truncated fields being set only after reading the full file stream.
    const maxSizeBytes = sizeInBytes(config.maxSize);
    if (
      data.file.truncated ||
      (maxSizeBytes > 0 && data.file.bytesRead > maxSizeBytes)
    ) {
      await this._storage.delete(fileName);
      throw new HttpError(
        `File size exceeded limit of ${maxSizeBytes} bytes`,
        400
      );
    }

    try {
      // Check if a resource already has a file for a single file property and
      // delete it after successfully creating the new one.
      let existingFile: File | null = null;
      if (!config.array) {
        const resourceWithFile = await client.findFirst({
          where: { id: resource.id },
          include: { [data.fieldname]: true }
        });
        existingFile = resourceWithFile[data.fieldname];
      }

      const result = await client.update({
        where: { id: resource.id },
        data: {
          [data.fieldname]: {
            create: createFile
          }
        },
        include: { [data.fieldname]: true }
      });

      if (existingFile !== null) {
        await this.deleteSafe(existingFile.name);
      }

      let file: File = result[data.fieldname];
      if (isArray(result[data.fieldname])) {
        file = result[data.fieldname].find(
          (f: File) => f.name === createFile.name
        );
      }

      logger.debug({ file }, 'File saved');

      return file;
    } catch (e) {
      await this.deleteSafe(fileName);
      throw new HttpError(`File create error`, 500, e);
    }
  }

  /**
   * Saves files received as an asynchronous iterable of multipart data.
   *
   * @param {AsyncIterableIterator<Multipart>} parts - The asynchronous iterable providing multipart data where each
   * part is expected to represent a file or other data.
   * @param {Resource} resource - The resource associated with the files being saved, providing additional contextual
   * information.
   * @param {ResourceClient} client - The database client responsible for handling resource-related operations, such as
   * database interaction.
   * @return {Promise<File[]>} A promise that resolves to an array of successfully saved files. Rejects with an error
   * if one or more files fail to save.
   */
  public async saveFiles(
    parts: AsyncIterableIterator<Multipart>,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    const saveActions: Promise<File>[] = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        saveActions.push(this.saveFile(part, resource, client));
      }
    }

    const saveResults = await Promise.allSettled(saveActions);

    const savedFiles = saveResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    const errors = saveResults
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason);

    if (errors.length > 0) {
      // Delete all successfully saved files in storage and rows in a database.
      const deleteActions = savedFiles.map((f) => this.deleteSafe(f.name));
      await Promise.all(deleteActions);

      const errorMessage = errors.join('\n');
      throw new HttpError(`Error while saving files: ${errorMessage}`, 400);
    }

    return savedFiles;
  }

  /**
   * Deletes a file from the storage and database if it meets the specified conditions.
   *
   * @param {string} fileName - The name of the file to be deleted.
   * @param {string} fieldName - The field associated with the resource to which the file belongs.
   * @param {Resource} resource - The resource that the file is associated with.
   * @param {ResourceClient} client - The client instance representing the resource's type.
   * @return {Promise<File>} A promise that resolves with the deleted file information upon successful deletion.
   * @throws {HttpError} If the file is not associated with the provided resource or client,
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
    if (
      file.resourceId !== resource.id ||
      file.resourceName !== client.name ||
      file.resourceField !== fieldName
    ) {
      throw new HttpError(
        `File does not belong to a '${client.name}' resource`,
        403
      );
    }

    const policy = this.getFilePolicy(file.resourceName, file.resourceField);

    if (
      currentUser &&
      policy.canDelete?.(currentUser, resource, file) === false
    ) {
      throw new HttpError('Deleting file is forbidden', 403);
    }

    const result = await this._storage.delete(fileName);
    if (!result) {
      throw new HttpError('Error deleting file from storage', 500);
    }

    try {
      const deletedFile = (await this._db.client().file.delete({
        where: { name: fileName }
      })) as File;

      logger.debug({ deletedFile }, 'File deleted');

      return deletedFile;
    } catch (e) {
      throw new HttpError(`File delete error`, 500, e);
    }
  }

  /**
   * Deletes a list of files associated with a given resource using the provided resource client.
   *
   * @param {Record<string, string | string[]>} fileNames - An object where the keys correspond to file fields and the
   * values are either a string (single file name) or an array of file names to be deleted.
   * @param {Resource} resource - The resource instance associated with the files to be deleted.
   * @param {ResourceClient} client - The resource client used to handle deletion operations.
   * @return {Promise<File[]>} A promise that resolves to an array of files that were successfully deleted. Rejects with
   * an error if no files could be deleted.
   */
  public async deleteFiles(
    fileNames: Record<string, string | string[]>,
    resource: Resource,
    client: ResourceClient
  ): Promise<File[]> {
    if (Object.keys(fileNames ?? {}).length === 0) {
      throw new HttpError('No files for deletion are provided', 400);
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
      throw new HttpError(`Error while deleting files: ${errorMessage}`, 400);
    }

    return deletedFiles;
  }

  /** @internal */
  private async deleteSafe(fileName: string): Promise<boolean> {
    let success = true;

    try {
      const result = await this._storage.delete(fileName);
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
    resourceId: number
  ): Promise<number> {
    try {
      return await this._db.client().file.count({
        where: { resourceField, resourceName, resourceId }
      });
    } catch (e) {
      throw new HttpError(`File count read error`, 500, e);
    }
  }

  /** @internal */
  private getFileConfig(
    resourceName?: string | null,
    resourceField?: string | null
  ): FileField {
    if (!resourceName || !resourceField) {
      return {};
    }

    const config =
      injectModel(resourceName, false)?.config.files?.[resourceField] ?? {};

    return { ...config };
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

    return { ...policy };
  }
}
