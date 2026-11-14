import { ErrorCode } from './error-code';
import { FieldError } from './problem-details';

type ModelDetails = { model: string };
type FieldsDetails = { fields: string[]; model?: string; constraint?: string };
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

  [ErrorCode.ModuleInvalid]: { path: string };
  [ErrorCode.ModuleMissing]: { name: string; requiredBy: string };
  [ErrorCode.ModuleDuplicate]: { name: string; paths: string[] };
  [ErrorCode.ModuleIncompatible]: {
    name: string;
    framework: string;
    version: string;
  };
  [ErrorCode.ModuleProviderMissing]: { contract: string; provider: string };
  [ErrorCode.ModuleProviderAmbiguous]: {
    contract: string;
    providers: string[];
  };

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
    unknownFields?: string[];
  };
  [ErrorCode.ResourceDeleteRestricted]: ModelDetails & { referencedBy: string };

  [ErrorCode.AuthPasswordWeak]: { reason: string };
  [ErrorCode.AuthApiKeyMissing]: { header: string };
  [ErrorCode.AuthApiKeyPermissionDenied]: {
    roles: string[];
    permissions: string[];
  };

  [ErrorCode.AccountFeatureUnavailable]: { feature: string };
  [ErrorCode.Account2FAMethodUnavailable]: {
    method: string;
    availableMethods: string[];
  };
  [ErrorCode.Account2FAMethodNotEnabled]: {
    method?: string;
    enabledMethods: string[];
  };
  [ErrorCode.Account2FAMethodAlreadyEnabled]: { method: string };
  [ErrorCode.Account2FACodeInvalid]: { attemptsLeft: number };
  [ErrorCode.Account2FATooManyAttempts]: { maxAttempts: number };

  [ErrorCode.OAuth2ProviderError]: { provider: string; status?: number };
  [ErrorCode.OAuth2EmailUnavailable]: { provider: string };

  [ErrorCode.RecaptchaMissing]: { header: string };

  [ErrorCode.TurnstileMissing]: { header: string };
  [ErrorCode.TurnstileInvalid]: { errorCodes: string[] };

  [ErrorCode.FileNotFound]: FileDetails;
  [ErrorCode.FileForbidden]: { action: string; fileName?: string };
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

  [ErrorCode.MailerSendFailed]: {
    provider: string;
    subject?: string;
    status?: number;
    providerCode?: string | number;
  };

  [ErrorCode.SmsSendFailed]: {
    provider: string;
    status?: number;
    providerCode?: string | number;
  };

  [ErrorCode.TemplateNotFound]: { template: string; locale?: string };
  [ErrorCode.TemplateRenderFailed]: { template: string };
  [ErrorCode.TemplateLoadFailed]: { path: string };
  [ErrorCode.TemplatePreviewNotFound]: { template: string; locale?: string };

  [ErrorCode.LocaleLoadFailed]: { path: string };

  [ErrorCode.MemoryUnavailable]: { retryAfter?: number };

  [ErrorCode.TimeSeriesNotEnabled]: ModelDetails;
  [ErrorCode.TimeSeriesInvalidField]: ModelDetails & { field: string };
  [ErrorCode.TimeSeriesInvalidValue]: ModelDetails & {
    field: string;
    reason: string;
  };
  [ErrorCode.TimeSeriesInvalidTime]: { time: string };
  [ErrorCode.TimeSeriesInvalidRange]: { from: string; to: string };
  [ErrorCode.TimeSeriesInvalidBucket]: { bucket: string };
  [ErrorCode.TimeSeriesInvalidAggregate]: { aggregate: string };
  [ErrorCode.TimeSeriesTooManyPoints]: { maxPoints: number };
  [ErrorCode.TimeSeriesTooManyResources]: { maxResources: number };
  [ErrorCode.TimeSeriesForbidden]: ModelDetails & { action: string };
  [ErrorCode.TimeSeriesUnsupported]: { operation: string; provider: string };

  [ErrorCode.SpatialInvalidGeometry]: ModelDetails & {
    field: string;
    reason: string;
  };
  [ErrorCode.SpatialInvalidFilter]: ModelDetails & {
    field: string;
    reason: string;
  };
  [ErrorCode.SpatialTooManyCandidates]: ModelDetails & {
    field: string;
    maxCandidates: number;
  };
}

/** The details of an error code, see {@link ErrorDetailsMap}. */
export type ErrorDetails<C extends string> = C extends keyof ErrorDetailsMap
  ? ErrorDetailsMap[C]
  : Record<string, unknown>;
