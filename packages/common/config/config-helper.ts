export type ConfigHelper = {
  env<T = string>(key: string): T | undefined;
  env<T = string>(key: string, defaultValue: T): T;
  str(key: string): string | undefined;
  str(key: string, defaultValue: string): string;
  int(key: string): number | undefined;
  int(key: string, defaultValue: number): number;
  float(key: string): number | undefined;
  float(key: string, defaultValue: number): number;
  bool(key: string): boolean | undefined;
  bool(key: string, defaultValue: boolean): boolean;
  arr<T = string>(key: string): T[] | undefined;
  arr<T = string>(key: string, defaultValue: T[]): T[];
};

export function addHelpers<T extends object>(
  parsedConfig: T
): T & ConfigHelper {
  /**
   * Helper function to get a value from config or process.env as a string
   */
  function env<T = string>(key: string): T | undefined;
  function env<T = string>(key: string, defaultValue: T): T;
  function env<T = string>(key: string, defaultValue?: T): T | undefined {
    if (key in parsedConfig) {
      const value = parsedConfig[key];
      return Array.isArray(value) ? (value.join(',') as T) : value;
    }

    return (process.env[key] as T) ?? defaultValue;
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

    const envValue = process.env[key];
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
