export type File = {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string | null;
  description?: string | null;
  resourceField?: string | null;
  resourceName?: string | null;
  resourceId?: number | null;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number | null;
};

export type MultipartFile = {
  fieldName: string;
  fileName: string;
  encoding: string;
  mimeType: string;
  bytesRead: number;
  truncated: boolean;
};
