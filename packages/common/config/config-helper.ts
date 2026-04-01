import { CONFIG_NAME } from '../constants';

export type ConfigHelper = {
  /**
   * Retrieves the value of the specified environment variable.
   *
   * @param key The name of the environment variable to retrieve.
   * @return The value of the environment variable converted to the specified type `T`, or `undefined` if the variable
   * does not exist.
   */
  env<T = string>(key: string): T | undefined;
  /**
   * Retrieves the value of a given environment variable.
   * If the variable is not found, returns the provided default value.
   *
   * @param {string} key - The name of the environment variable to retrieve.
   * @param {Object} defaultValue - The default value to return if the environment variable is not set.
   * @return {Object} The value of the environment variable, or the default value if the variable is not set.
   */
  env<T = string>(key: string, defaultValue: T): T;
  /**
   * Retrieves the string value associated with the given key.
   *
   * @param {string} key - The key for which to retrieve the associated string value.
   * @return {string | undefined} The string value associated with the key, or undefined if the key does not exist.
   */
  str(key: string): string | undefined;
  /**
   * Retrieves a string value associated with the given key.
   * If the key does not exist, returns the provided default value.
   *
   * @param {string} key - The key to look up in the data source.
   * @param {string} defaultValue - The value to return if the key is not found.
   * @return {string} The string value associated with the key, or the default value if the key is not found.
   */
  str(key: string, defaultValue: string): string;
  /**
   * Retrieves the integer value associated with the given key.
   *
   * @param {string} key - The key used to retrieve the associated integer value.
   * @return {number | undefined} The integer value associated with the key, or undefined if the key does not exist.
   */
  int(key: string): number | undefined;
  /**
   * Retrieves the integer value associated with the specified key.
   * If the key does not exist, the provided default value is returned.
   *
   * @param {string} key - The key whose associated integer value is to be retrieved.
   * @param {number} defaultValue - The value to return if the key does not exist.
   * @return {number} The integer value associated with the specified key, or the default value if the key is not found.
   */
  int(key: string, defaultValue: number): number;
  /**
   * Attempts to retrieve the value associated with the given key and convert it to a floating-point number.
   *
   * @param {string} key - The key whose associated value is to be retrieved and converted.
   * @return {number | undefined} The floating-point representation of the value,
   * or `undefined` if the key does not exist or conversion is not possible.
   */
  float(key: string): number | undefined;
  /**
   * Retrieves the value associated with the given key, converts it to a floating-point number,
   * and returns it. If the key does not exist or the value cannot be converted, the default value is returned.
   *
   * @param {string} key - The key corresponding to the desired value.
   * @param {number} defaultValue - The default value to be returned if the key does not exist or cannot be converted to
   * a float.
   * @return {number} The floating-point number associated with the key or the default value.
   */
  float(key: string, defaultValue: number): number;
  /**
   * Determines the boolean value associated with a given key. If the key is not found, it returns undefined.
   *
   * @param {string} key - The key used to retrieve the boolean value.
   * @return {boolean | undefined} The boolean value associated with the provided key, or undefined if the key does not
   * exist.
   */
  bool(key: string): boolean | undefined;
  /**
   * Retrieves a boolean value associated with the given key. If the key does not exist, the default value is returned.
   *
   * @param {string} key - The key to look for in the data source.
   * @param {boolean} defaultValue - The default value to return if the key is not found.
   * @return {boolean} The boolean value associated with the key or the default value if the key is missing.
   */
  bool(key: string, defaultValue: boolean): boolean;
  /**
   * Retrieves an array of values of type T associated with the specified key.
   *
   * @param {string} key - The key used to fetch the corresponding array of values.
   * @return {Object[] | undefined} An array of values of type T if the key exists; otherwise, undefined.
   */
  arr<T = string>(key: string): T[] | undefined;
  /**
   * Retrieves an array associated with the specified key. If the key does not exist, it returns the default value
   * provided.
   *
   * @param {string} key - The key used to retrieve the associated array.
   * @param {Object[]} defaultValue - The default array to return if the key does not exist.
   * @return {Object[]} The array associated with the specified key, or the default value if the key does not exist.
   */
  arr<T = string>(key: string, defaultValue: T[]): T[];
};

export function addHelpers<C extends object>(
  parsedConfig: C
): C & ConfigHelper {
  function extractConfigValue(key: string): any {
    if (key in parsedConfig) {
      return parsedConfig[key];
    }
    const additionalConfigKey = `_${CONFIG_NAME}_${key}`;
    if (additionalConfigKey in parsedConfig) {
      return parsedConfig[additionalConfigKey];
    }
  }

  /**
   * Helper function to get a value from config or process.env as a string
   */
  function env<T = string>(key: string): T | undefined;
  function env<T = string>(key: string, defaultValue: T): T;
  function env<T = string>(key: string, defaultValue?: T): T | undefined {
    const value = extractConfigValue(key);
    if (value !== undefined) {
      return Array.isArray(value) ? (value?.join(',') as T) : value;
    }

    return defaultValue;
  }

  /**
   * Helper function to get a value from config or process.env as a string
   */
  function str(key: string): string | undefined;
  function str(key: string, defaultValue: string): string;
  function str(key: string, defaultValue?: string): string | undefined {
    return env(key, defaultValue);
  }

  /**
   * Helper function to get a value from config or process.env as an integer
   */
  function int(key: string): number | undefined;
  function int(key: string, defaultValue: number): number;
  function int(key: string, defaultValue?: number): number | undefined {
    const value = env(key);

    if (value === undefined) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);

    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Helper function to get a value from config or process.env as a float
   */
  function float(key: string): number | undefined;
  function float(key: string, defaultValue: number): number;
  function float(key: string, defaultValue?: number): number | undefined {
    const value = env(key);

    if (value === undefined) {
      return defaultValue;
    }

    const parsed = parseFloat(value);

    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Helper function to get a value from config or process.env as a boolean
   */
  function bool(key: string): boolean | undefined;
  function bool(key: string, defaultValue: boolean): boolean;
  function bool(key: string, defaultValue?: boolean): boolean | undefined {
    const value = env(key);

    if (value === undefined) {
      return defaultValue;
    }

    return ['true', 'on', 'yes', '1'].includes(value.toLowerCase().trim());
  }

  /**
   * Helper function to get a value from config or process.env as an array
   */
  function arr<T = string>(key: string): T[] | undefined;
  function arr<T = string>(key: string, defaultValue: T[]): T[];
  function arr<T = string>(key: string, defaultValue?: T[]): T[] | undefined {
    if (key in parsedConfig) {
      const value = parsedConfig[key];
      return Array.isArray(value) ? value : [value];
    }

    const envValue = extractConfigValue(key);
    if (envValue === undefined) {
      return defaultValue;
    }

    // Determine type from default value if provided
    const sampleValue = defaultValue?.[0];
    const targetType = typeof sampleValue;

    return envValue.split(',').map((v) => {
      const trimmed = v.trim();

      if (targetType === 'number') {
        const parsed = parseFloat(trimmed);
        return (isNaN(parsed) ? trimmed : parsed) as T;
      }

      if (targetType === 'boolean') {
        return ['true', 'on', 'yes', '1'].includes(trimmed.toLowerCase()) as T;
      }

      return trimmed as T;
    });
  }

  return Object.assign(parsedConfig, {
    env,
    str,
    int,
    float,
    bool,
    arr
  });
}
