import { ResourceId } from './resource';

export type File = {
  id: ResourceId;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string | null;
  description?: string | null;
  resourceField?: string | null;
  resourceName?: string | null;
  /** Id of the owning resource, stored as text so it fits either primary key type */
  resourceId?: string | null;
  updatedAt: Date;
  createdAt: Date;
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
