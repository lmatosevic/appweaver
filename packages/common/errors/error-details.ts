import { ErrorCode } from './error-code';
import { FieldError } from './problem-details';

type ModelDetails = { model: string };
type FieldsDetails = { model?: string; fields: string[]; constraint?: string };
type FileDetails = { fileName: string };

/**
 * The details every error code carries, returned as the `details` of its
 * problem details response. A code missing here carries an empty object.
 */
export interface ErrorDetailsMap {
  [ErrorCode.ValidationFailed]: { errors: FieldError[] };
  [ErrorCode.RateLimited]: { retryAfter?: number };

  [ErrorCode.ConfigurationInvalid]: { errors?: string[] };
  [ErrorCode.ContextDefinitionMissing]: { name: string; kind: string };
  [ErrorCode.ContextDefinitionDuplicate]: { name: string };

  [ErrorCode.DatabaseUniqueViolation]: FieldsDetails;
  [ErrorCode.DatabaseForeignKeyViolation]: FieldsDetails;
  [ErrorCode.DatabaseNullViolation]: FieldsDetails;
  [ErrorCode.DatabaseValueTooLong]: FieldsDetails;
  [ErrorCode.DatabaseValueOutOfRange]: FieldsDetails;
  [ErrorCode.DatabaseInvalidValue]: FieldsDetails;
  [ErrorCode.DatabaseRecordNotFound]: { model?: string };
  [ErrorCode.DatabaseWriteConflict]: { model?: string };
  [ErrorCode.DatabaseOperationFailed]: { model?: string; prismaCode?: string };

  [ErrorCode.ResourceNotFound]: ModelDetails & { id?: string | number };
  [ErrorCode.ResourceForbidden]: ModelDetails & { action: string };
  [ErrorCode.ResourceInvalidSort]: { model?: string; field?: string };
  [ErrorCode.ResourceInvalidAggregate]: ModelDetails & {
    field?: string;
    operator?: string;
  };
  [ErrorCode.ResourceInvalidQueryParameter]: { parameter: string };
  [ErrorCode.ResourceInvalidRelation]: ModelDetails & {
    relation: string;
    missingFields?: string[];
  };
  [ErrorCode.ResourceDeleteRestricted]: ModelDetails & { referencedBy: string };

  [ErrorCode.AuthPasswordWeak]: { reason: string };
  [ErrorCode.AuthApiKeyMissing]: { header: string };

  [ErrorCode.AccountFeatureUnavailable]: { feature: string };

  [ErrorCode.OAuth2ProviderError]: { provider: string; status?: number };
  [ErrorCode.OAuth2EmailUnavailable]: { provider: string };

  [ErrorCode.RecaptchaMissing]: { header: string };

  [ErrorCode.FileNotFound]: FileDetails;
  [ErrorCode.FileForbidden]: { fileName?: string; action: string };
  [ErrorCode.FileFieldNotFound]: ModelDetails & { field: string };
  [ErrorCode.FileUnsupportedType]: { mimeType: string };
  [ErrorCode.FileTooLarge]: { maxSizeBytes: number };
  [ErrorCode.FileLimitExceeded]: { maxCount: number };
  [ErrorCode.FileInvalidPath]: FileDetails;
  [ErrorCode.FileUploadFailed]: { errors: string[] };
  [ErrorCode.FileDeleteFailed]: { errors: string[] };

  [ErrorCode.ExportFailed]: ModelDetails;

  [ErrorCode.QueueClosed]: { queue: string };
  [ErrorCode.QueueUnavailable]: { queue: string };

  [ErrorCode.MailerSendFailed]: { subject?: string };
}

/** The details of an error code, see {@link ErrorDetailsMap}. */
export type ErrorDetails<C extends string> = C extends keyof ErrorDetailsMap
  ? ErrorDetailsMap[C]
  : Record<string, unknown>;
