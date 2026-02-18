import { Prisma } from '../prisma/client/client';

export type Resource = {
  id: number;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number;
};

export type ResourceOmit<T> = Omit<T, keyof Resource>;

export type ResourceName = keyof typeof Prisma.ModelName;

export type ResourceModel = Record<Prisma.PrismaAction, any> & {
  name: ResourceName;
};
