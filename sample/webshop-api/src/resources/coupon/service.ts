import { createService } from '@appweaver/core';
import { CouponCreate, CouponUpdate } from '@/types';

export default createService({
  modelName: 'Coupon',
  // Codes are typed by customers in any case, and stored upper case
  beforeCreate: (data: CouponCreate) => {
    data.code = data.code.toUpperCase();
  },
  beforeUpdate: (_, data: CouponUpdate) => {
    if (data.code) {
      data.code = data.code.toUpperCase();
    }
  }
});
