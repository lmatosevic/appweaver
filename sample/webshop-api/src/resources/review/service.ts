import { createService, currentAuthUser, HttpError } from '@appweaver/core';
import db from '@db/client';
import { ReviewCreate } from '@/types';

type ReviewData = ReviewCreate & {
  authorName?: string;
  verifiedPurchase?: boolean;
};

export default createService({
  modelName: 'Review',
  beforeCreate: async (data: ReviewData) => {
    const user = currentAuthUser() as
      | { id: number; firstName: string; lastName: string }
      | undefined;
    if (!user) {
      return;
    }

    const productId =
      typeof data.product === 'object' ? data.product.id : data.product;

    const existing = await db.review.findFirst({
      where: { productId, authorId: user.id },
      select: { id: true }
    });
    if (existing) {
      throw new HttpError(
        `The product is already reviewed, update review ${existing.id} instead`,
        409
      );
    }

    // Bought and paid for, so the review is marked as a verified purchase
    const purchase = await db.orderItem.findFirst({
      where: {
        productId,
        order: {
          customerId: user.id,
          status: { in: ['Paid', 'Shipped', 'Delivered'] }
        }
      },
      select: { id: true }
    });

    data.verifiedPurchase = !!purchase;
    data.authorName = `${user.firstName} ${user.lastName.charAt(0)}.`;
  }
});
