import { createService, currentAuthUser } from '@appweaver/core';
import db from '@db/client';

export default createService({
  modelName: 'Address',
  // A single default address per customer
  beforeCreate: (data) => clearOtherDefaults(data.isDefault),
  beforeUpdate: (_, data) => clearOtherDefaults(data.isDefault)
});

async function clearOtherDefaults(isDefault?: boolean): Promise<void> {
  const user = currentAuthUser();
  if (isDefault && user) {
    await db.address.updateMany({
      where: { userId: Number(user.id), isDefault: true },
      data: { isDefault: false }
    });
  }
}
