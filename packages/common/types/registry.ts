/**
 * The types of every resource model of the application, keyed by the model name. The interface is empty here and
 * filled in by the types `weaver generate` emits, which augment this module with one entry per model. Once filled in,
 * the factories and injection functions infer the model types from a model name alone, i.e.
 * `createService({ modelName: 'Post' })` and `injectService('Post')`.
 */
export interface ResourceRegistry {}

/** The types of a single resource model, as registered in {@link ResourceRegistry}. */
export type ResourceRegistryEntry = {
  /** The model with every field */
  model: any;
  /** The output of a single resource */
  single: any;
  /** The output of a resource in a list */
  multiple: any;
  /** The create input */
  create: any;
  /** The update input */
  update: any;
  /** The query filter */
  query: any;
  /** The resource service */
  service: any;
  /** The names of the relation fields */
  relations: string;
};

/** The names of the registered resource models. */
export type RegisteredModel = Extract<keyof ResourceRegistry, string>;

/** The name of a resource model: one of the registered models, or any string before the types are generated. */
export type ModelName = [RegisteredModel] extends [never]
  ? string
  : RegisteredModel;

/**
 * Resolves one of the registered types of a model, or the fallback type for a model that is not registered.
 *
 * @template N The model name.
 * @template K The registered type to resolve.
 * @template F The type used when the model is not registered.
 */
export type RegistryType<
  N extends string,
  K extends keyof ResourceRegistryEntry,
  F = any
> = N extends RegisteredModel
  ? ResourceRegistry[N] extends Record<K, infer V>
    ? V
    : F
  : F;

/**
 * The database record of a model, as the policies receive it: the model fields along with the foreign key columns,
 * which the model types do not declare.
 */
export type ResourceRecord<N extends string> = RegistryType<
  N,
  'model',
  Record<string, any>
> &
  Record<string, any>;
