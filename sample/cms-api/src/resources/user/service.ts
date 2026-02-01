import { Prisma, User } from '@prisma/client';
import { db, ResourceService } from '@appweaver/core';

export class UserService extends ResourceService<
  User,
  Prisma.UserDelegate,
  Prisma.UserWhereInput
> {
  constructor() {
    super(db.client.user);
  }
}

const userService = new UserService();

export default userService;
