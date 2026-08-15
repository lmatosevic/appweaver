/** Options controlling how the TypeScript types are generated from an OpenAPI schema. */
export type GenerateTypesOptions = {
  /** Whether the types are written into a declaration (`.d.ts`) file, which holds no runtime
   * values and so declares the enum constants instead of initializing them. (default: false) */
  declaration?: boolean;
};
