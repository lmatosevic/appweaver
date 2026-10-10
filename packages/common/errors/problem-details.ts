/** A single invalid field of a rejected request. */
export type FieldError = {
  /** The dot notation path of the field, i.e. `author.email`. */
  field: string;
  /** The rule the field failed, i.e. `required`, `unique` or `maxLength`. */
  rule: string;
  /** The human-readable description of the failure. */
  message: string;
  /** The JSON pointer to the field in the request, i.e. `#/body/email`. */
  pointer?: string;
};

/**
 * The error response of the API, following the RFC 9457 problem details
 * format, extended with the machine-readable `code` of the error.
 */
export type ProblemDetails = {
  /** A URI reference identifying the problem type. */
  type: string;
  /** A short summary of the problem type, the same for every occurrence. */
  title: string;
  /** The HTTP status code of the response. */
  status: number;
  /** The error code, one of the `ErrorCode` values or an application code. */
  code: string;
  /** The explanation of this occurrence of the problem. */
  detail: string;
  /** The path of the request the problem occurred on. */
  instance?: string;
  /** The id of the request, matching the one in the server logs. */
  requestId?: string;
  /** The invalid fields of the request. */
  errors?: FieldError[];
  /** The details of the error, specific to its code. */
  details?: Record<string, unknown>;
};
