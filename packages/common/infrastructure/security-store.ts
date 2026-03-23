export type ValidationResult = {
  valid: boolean;
  message: string;
};

export abstract class SecurityStore {
  abstract generateOneTimeToken<T = any>(
    purpose: string,
    data: T,
    ttl: number
  ): Promise<string>;

  abstract useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => ValidationResult
  ): Promise<T>;
}
