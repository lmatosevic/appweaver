/**
 * Converts an array into its string representation.
 *
 * @param {[]} array - The array to be converted to a string.
 * @return {string} The string representation of the given array.
 */
export function arrayToString<T = any>(array: T[]): string {
  return JSON.stringify(array);
}

/**
 * Converts a JSON-formatted string into an array.
 *
 * @param {string} value - The JSON-formatted string to be converted into an array.
 * @return {[]} The parsed array from the provided string.
 */
export function stringToArray<T = any>(value: string): T[] {
  return JSON.parse(value);
}
