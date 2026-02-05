export function arrayToString<T = any>(array: T[]): string {
  return JSON.stringify(array);
}

export function stringToArray<T = any>(value: string): T[] {
  return JSON.parse(value);
}
