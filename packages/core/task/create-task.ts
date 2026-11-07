// Registered globally, so a task is recognized whichever copy of this package defined it
export const TASK = Symbol.for('appweaver.task');

/**
 * A positional argument of a task. The values fill the arguments in their order, so the required ones come first and
 * only the last one is variadic.
 */
export type TaskArgument = {
  /** Shown by `weaver run <task> --help`. */
  description?: string;
  /** A `number` fails for a value that is not one. Default: `'string'`. */
  type?: 'string' | 'number';
  /** Takes every remaining value as an array. Default: `false`. */
  variadic?: boolean;
  /** The allowed values of a `string` argument. */
  choices?: readonly string[];
} & (
  | { required: true; default?: never }
  | {
      required?: false;
      default?: string | number | readonly string[] | readonly number[];
    }
);

/** An option of a task, its camelCase name being a kebab-case flag (`dryRun` is `--dry-run`). */
export type TaskOption = {
  /** Shown by `weaver run <task> --help`. */
  description?: string;
  /** A `number` fails for a value that is not one, a `boolean` is a flag. Default: `'string'`. */
  type?: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  /** The allowed values of a `string` option. */
  choices?: readonly string[];
};

export type TaskArguments = Record<string, TaskArgument>;

export type TaskOptions = Record<string, TaskOption>;

type ValueOf<T extends TaskArgument | TaskOption> = T extends {
  type: 'number';
}
  ? number
  : T extends { type: 'boolean' }
    ? boolean
    : T extends { choices: readonly (infer C extends string)[] }
      ? C
      : string;

type Given<T extends TaskArgument | TaskOption, V> = T extends
  | { required: true }
  | { default: NonNullable<unknown> }
  ? V
  : V | undefined;

/** The values of the arguments: an array for a variadic one, `undefined` for a missing optional one. */
export type TaskArgumentValues<A extends TaskArguments> = {
  [K in keyof A]: A[K] extends { variadic: true }
    ? ValueOf<A[K]>[]
    : Given<A[K], ValueOf<A[K]>>;
};

/** The values of the options: `false` for a missing flag, `undefined` for a missing optional one. */
export type TaskOptionValues<O extends TaskOptions> = {
  [K in keyof O]: O[K] extends { type: 'boolean' }
    ? boolean
    : Given<O[K], ValueOf<O[K]>>;
};

/** What the `run` function of a task receives. */
export type TaskContext<
  A extends TaskArguments = TaskArguments,
  O extends TaskOptions = TaskOptions
> = {
  args: TaskArgumentValues<A>;
  options: TaskOptionValues<O>;
  /** The arguments given after the task, as they are. */
  argv: string[];
};

/** The definition of a task given to {@link createTask}. */
export type TaskDefinition<
  A extends TaskArguments = TaskArguments,
  O extends TaskOptions = TaskOptions
> = {
  /** Runs the task, returning its exit code, `0` when it returns no number. */
  run(context: TaskContext<A, O>): unknown;
  /** The name run by `weaver run <name>`. Default: its path in the tasks directory (`reports/daily.ts` is `reports:daily`). */
  name?: string;
  /** Listed by `weaver run`. */
  description?: string;
  /** Without them the task takes any argument, read from `argv`. */
  arguments?: A;
  /** Without them the task takes any option, read from `argv`. */
  options?: O;
};

/** A task returned by {@link createTask}. */
export type Task<
  A extends TaskArguments = TaskArguments,
  O extends TaskOptions = TaskOptions
> = Readonly<TaskDefinition<A, O>> & { readonly [TASK]: true };

/**
 * Creates a task, the default export of a file in the tasks directory (`app.tasksDirPath`) or the `tasks` directory of
 * a module, run with the application by `weaver run <name> [args...]`, the values typed from the declarations.
 *
 * @example
 * export default createTask({
 *   description: 'Counts the orders of a status.',
 *   arguments: { status: { required: true, choices: ['Pending', 'Paid'] } },
 *   options: { min: { type: 'number', default: 1 } },
 *   run: async ({ args, options }) => {
 *     const count = await injectService('Order').count({ status: args.status });
 *     return count >= options.min ? 0 : 1;
 *   }
 * });
 *
 * @param {TaskDefinition} definition - The definition of the task.
 * @return {Task} The frozen task.
 */
export function createTask<
  const A extends TaskArguments = Record<never, TaskArgument>,
  const O extends TaskOptions = Record<never, TaskOption>
>(definition: TaskDefinition<A, O>): Task<A, O> {
  return Object.freeze({ ...definition, [TASK]: true as const });
}

/**
 * Checks if a value is a task created with {@link createTask}.
 *
 * @param {unknown} value - The value to check.
 * @return {boolean} `true` for a task.
 */
export function isTask(value: unknown): value is Task {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[TASK] === true
  );
}
