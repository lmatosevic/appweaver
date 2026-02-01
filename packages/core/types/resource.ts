import { Prisma } from '@prisma/client';

export type ActionType =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete';

export type ResourceName = keyof typeof Prisma.ModelName;

export type Resource = {
  id: number;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number;
};

export type ResourceOmit<T> = Omit<T, keyof Resource>;

export type ResourceModel = Record<Prisma.PrismaAction, any> & {
  name: ResourceName;
};

export type QueryResponse<T> = {
  resultCount: number;
  totalCount: number;
  items: T[];
};
