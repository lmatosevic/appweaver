export type Permission = {
  id: number;
  name: string;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number | null;
}
