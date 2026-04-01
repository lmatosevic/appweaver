export type ValidationResult = {
  valid: boolean;
  message: string;
};

export abstract class SecurityStore {
  /**
   * Generates a one-time-use token for the provided authenticated user.
   *
   * @param {string} purpose - The purpose for which the token is generated.
   * @param {Object} data - The data to store for generated token. (Will be retrieved on token usage)
   * @param {number} ttl - The time-to-live for the token in milliseconds.
   * @return {Promise<string>} A promise that resolves to the generated one-time token.
   */
  abstract generateOneTimeToken<T = any>(
    purpose: string,
    data: T,
    ttl: number
  ): Promise<string>;

  /**
   * Consumes a one-time token for a specific purpose. Retrieves the associated
   * value from the token if it is valid and then invalidates the token by removing it.
   *
   * @param {string} token - The one-time token to be consumed.
   * @param {string} purpose - The intended purpose of the one-time token.
   * @param {(value: Object) => boolean} [validateContent] - The optional function used to check if token content is
   * valid.
   * @return A promise resolving to the value associated with the token. The resolved type defaults to `any` but can
   * be specified using generics.
   * @throws {Error} - Throws an error if the token is invalid or expired and if `validateContent` function is
   * provided it throws error if this functions returns false `valid` property value.
   */
  abstract useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => ValidationResult
  ): Promise<T>;
}
