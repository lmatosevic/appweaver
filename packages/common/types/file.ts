import { ResourceId } from './resource-id';

export type File = {
  id: ResourceId;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: Date;
  createdAt: Date;
  title?: string | null;
  description?: string | null;
  resourceField?: string | null;
  resourceName?: string | null;
  /** Id of the owning resource, stored as text so it fits either primary key type */
  resourceId?: string | null;
  createdById?: ResourceId | null;
};

export type MultipartFile = {
  fieldName: string;
  fileName: string;
  encoding: string;
  mimeType: string;
  bytesRead: number;
  truncated: boolean;
};
