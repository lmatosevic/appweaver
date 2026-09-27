/** The roles the routes check. */
export const Role = {
  /** Runs the shop: catalog, coupons, orders, and reports */
  Admin: 'Admin',
  /** Signs up through the registration route and places orders */
  Customer: 'Customer',
  /** The warehouse partner, calling the API with an API key */
  Fulfillment: 'Fulfillment'
} as const;
