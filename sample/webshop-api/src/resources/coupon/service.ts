import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Coupon',
  // Codes are typed by customers in any case, and stored upper case
  beforeCreate: (data) => {
    data.code = data.code.toUpperCase();
  },
  beforeUpdate: (_, data) => {
    if (data.code) {
      data.code = data.code.toUpperCase();
    }
  }
});
