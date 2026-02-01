import { Identity } from './identity';

export type File = {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  title: string | null;
  description: string | null;
  resourceField: string | null;
  resourceName: string | null;
  resourceId: number | null;
  updatedAt: Date;
  createdAt: Date;
  createdBy: Identity | null;
  createdById: number | null;
};
