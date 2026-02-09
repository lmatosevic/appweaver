import { Multipart, MultipartFile } from '@fastify/multipart';
import { FileField, generateToken, isArray } from '@appweaver/common';
import { HttpError } from '../errors';
import { context } from '../context';
import { ContentStream, storage } from './storage';
import { db } from '../database';
import { currentIdentity } from '../security';
import {
  generateFileName,
  isValidMimeType,
  parseRange,
  sizeInBytes
} from '../utils';
import { File, Resource, ResourceModel } from '../types';

export type FileStream = {
  content: ContentStream;
  fileName: string;
  mimeType: string;
  start: number;
  end: number;
};

export class FileService {
  public async findByName(fileName: string): Promise<File> {
    let file: File | null;

    try {
      file = (await db.client.file.findFirst({
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

  public async stream(fileName: string, range?: string): Promise<FileStream> {
    const identity = currentIdentity();

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
      const resourceService = context.services[file.resourceName];
      const resource = await resourceService.find(file.resourceId);

      if (identity && policy.canAccess?.(identity, resource, file) === false) {
        throw new HttpError('File access is forbidden', 403);
      }
    }

    const parsedRange = parseRange(range);
    const start = parsedRange.start;
    let end = parsedRange.end;

    const fileStream = await storage.stream(fileName, start, end);
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

  public async saveFile(
    data: MultipartFile,
    resource: Resource,
    model: ResourceModel
  ): Promise<File> {
    const identity = currentIdentity();

    if (!(data.fieldname in resource)) {
      throw new HttpError(
        `File field '${data.fieldname}' does not exist on resource '${model.name}'`,
        400
      );
    }

    const config = this.getFileConfig(model.name, data.fieldname);
    const policy = this.getFilePolicy(model.name, data.fieldname);

    if (!isValidMimeType(data.mimetype, config.mimeType)) {
      throw new HttpError(`Unsupported media file type: ${data.mimetype}`, 400);
    }

    if (config.array) {
      const fileCount = await this.fileCount(
        data.fieldname,
        model.name,
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
    if (typeof config.namePattern === 'function') {
      pattern = config.namePattern(data, resource);
    } else {
      pattern = config.namePattern;
    }

    let generatedName = generateFileName(data.filename, pattern, {
      resourceField: data.fieldname,
      resourceName: model.name,
      resourceId: resource.id,
      userId: identity?.id,
      userName: identity?.username
    });

    let nameRegenCount = 0;
    while (await storage.exists(generatedName)) {
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
      resourceName: model.name,
      resourceId: resource.id,
      createdById: identity?.id
    } as File;

    if (
      identity &&
      policy.canCreate?.(identity, resource, createFile) === false
    ) {
      throw new HttpError('Creating file is forbidden', 403);
    }

    const fileName = await storage.store(generatedName, data.file);
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
      await storage.delete(fileName);
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
        const resourceWithFile = await model.findFirst({
          where: { id: resource.id },
          include: { [data.fieldname]: true }
        });
        existingFile = resourceWithFile[data.fieldname];
      }

      const result = await model.update({
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

      return file;
    } catch (e) {
      await this.deleteSafe(fileName);
      throw new HttpError(`File create error`, 500, e);
    }
  }

  public async saveFiles(
    parts: AsyncIterableIterator<Multipart>,
    resource: Resource,
    model: ResourceModel
  ): Promise<File[]> {
    const saveActions: Array<Promise<File>> = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        saveActions.push(this.saveFile(part, resource, model));
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

  public async deleteFile(
    fileName: string,
    fieldName: string,
    resource: Resource,
    model: ResourceModel
  ): Promise<File> {
    const currentUser = currentIdentity();

    const file = await this.findByName(fileName);
    if (
      file.resourceId !== resource.id ||
      file.resourceName !== model.name ||
      file.resourceField !== fieldName
    ) {
      throw new HttpError(
        `File does not belong to a '${model.name}' resource`,
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

    const result = await storage.delete(fileName);
    if (!result) {
      throw new HttpError('Error deleting file from storage', 500);
    }

    try {
      return (await db.client.file.delete({
        where: { name: fileName }
      })) as File;
    } catch (e) {
      throw new HttpError(`File delete error`, 500, e);
    }
  }

  public async deleteFiles(
    fileNames: Record<string, string | string[]>,
    resource: Resource,
    model: ResourceModel
  ): Promise<File[]> {
    if (Object.keys(fileNames ?? {}).length === 0) {
      throw new HttpError('No files for deletion are provided', 400);
    }

    const deleteActions: Array<Promise<File>> = [];

    for (const [field, value] of Object.entries(fileNames)) {
      const names = typeof value === 'string' ? [value] : value;
      for (const name of names) {
        deleteActions.push(this.deleteFile(name, field, resource, model));
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

  private async deleteSafe(fileName: string): Promise<boolean> {
    let success = true;

    try {
      const result = await storage.delete(fileName);
      if (!result) {
        success = false;
      }
    } catch {
      success = false;
    }

    try {
      await db.client.file.delete({
        where: { name: fileName }
      });
    } catch {
      success = false;
    }

    return success;
  }

  private async fileCount(
    resourceField: string,
    resourceName: string,
    resourceId: number
  ): Promise<number> {
    try {
      return await db.client.file.count({
        where: { resourceField, resourceName, resourceId }
      });
    } catch (e) {
      throw new HttpError(`File count read error`, 500, e);
    }
  }

  private getFileConfig(
    resourceName?: string | null,
    resourceField?: string | null
  ): FileField {
    if (!resourceName || !resourceField) {
      return {};
    }

    const config =
      context.models[resourceName].config.files?.[resourceField] ?? {};

    return { ...config };
  }

  private getFilePolicy(
    resourceName?: string | null,
    resourceField?: string | null
  ): any {
    if (!resourceName || !resourceField) {
      return {};
    }

    const policy = context.policies[resourceName].files?.[resourceField] ?? {};

    return { ...policy };
  }
}

const fileService = new FileService();

export { fileService };
