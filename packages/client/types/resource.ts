/** Primary key value: a number for `int` and `bigInt` ids, a string for `string` ids */
export type ResourceId = number | string;

/** An item of a bulk update or replacement: the id of the record and its data. */
export type BulkItem<T> = {
  id: ResourceId;
  data: T;
};

/** The response of a bulk request when the server does not return the records, which either applies every item or
 * none. */
export type BulkResponse = {
  /** Always true, since a failed bulk request throws a `ClientError` */
  success: boolean;
  /** The number of records created, updated, or deleted */
  count: number;
};
