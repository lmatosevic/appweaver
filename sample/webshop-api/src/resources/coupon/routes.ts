import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

const admin = { roles: [Role.Admin] };

// Customers only ever send a code with the checkout
export default createRoutes({
  modelName: 'Coupon',
  path: '/coupons',
  find: admin,
  query: admin,
  aggregate: admin,
  create: admin,
  update: admin,
  delete: admin,
  export: admin
});
