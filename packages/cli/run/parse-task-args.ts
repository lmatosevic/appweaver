import {
  Argument,
  Command,
  CommanderError,
  InvalidArgumentError,
  Option
} from 'commander';
import { camelToSnakeCase } from '@appweaver/common';
import {
  Task,
  TaskArgument,
  TaskArguments,
  TaskContext,
  TaskOption
} from '@appweaver/core';
import { TaskError } from './load-tasks';

/** The parsed arguments of a task, or the exit code after its help or an invalid argument. */
export type ParsedTaskArgs = { context: TaskContext } | { exitCode: number };

/**
 * Creates the command parsing the arguments and the options a task declares. A task without arguments takes any
 * argument, and one without options any option.
 *
 * @param {string} name - The name of the task.
 * @param {Task} task - The task.
 * @return {Command} The command.
 * @throws {TaskError} When the arguments cannot be given in the order they are declared.
 */
export function taskCommand(name: string, task: Task): Command {
  const command = new Command(`weaver run ${name}`)
    .helpOption('-h, --help', 'Output usage information.')
    .showHelpAfterError(`(run weaver run ${name} --help for its usage)`)
    .exitOverride()
    .action(() => undefined);
  if (task.description) {
    command.description(task.description);
  }
  if (!task.arguments) {
    command.allowExcessArguments();
  }
  if (!task.options) {
    command.allowUnknownOption();
  }

  checkArguments(name, task.arguments ?? {});
  for (const [key, argument] of Object.entries(task.arguments ?? {})) {
    command.addArgument(taskArgument(key, argument));
  }
  for (const [key, option] of Object.entries(task.options ?? {})) {
    command.addOption(taskOption(key, option));
  }
  return command;
}

/**
 * Parses the arguments given to a task. The command writes the help and the errors, so only their exit code is
 * returned.
 *
 * @param {string} name - The name of the task.
 * @param {Task} task - The task.
 * @param {string[]} argv - The arguments given after the task.
 * @return {ParsedTaskArgs} The context of the task, or the exit code.
 */
export function parseTaskArgs(
  name: string,
  task: Task,
  argv: string[]
): ParsedTaskArgs {
  const command = taskCommand(name, task);
  try {
    command.parse(argv, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      return { exitCode: error.exitCode };
    }
    throw error;
  }

  const args = Object.fromEntries(
    Object.keys(task.arguments ?? {}).map((key, index) => [
      key,
      command.processedArgs[index]
    ])
  );
  const values = command.opts();
  const options = Object.fromEntries(
    Object.entries(task.options ?? {}).map(([key, option]) => [
      key,
      // A missing flag is false, without a default shown in the help
      values[new Option(`--${kebabCase(key)}`).attributeName()] ??
        (option.type === 'boolean' ? false : undefined)
    ])
  );
  return { context: { args, options, argv } };
}

/**
 * Checks that the values can fill the arguments in their order: no integer name (ordered first by JavaScript), no
 * required argument after an optional one or with a default, and a variadic one only last.
 */
function checkArguments(name: string, args: TaskArguments): void {
  const fail = (reason: string): never => {
    throw new TaskError(
      `The task ${name} declares invalid arguments: ${reason}`
    );
  };
  const keys = Object.keys(args);
  let optional: string | undefined;
  for (const [index, key] of keys.entries()) {
    const { required, variadic, default: value } = args[key];
    if (/^\d+$/.test(key)) {
      fail(`the name ${key} is a number, ordered before the other names`);
    }
    if (required && value !== undefined) {
      fail(`the required ${key} has a default that is never used`);
    }
    if (required && optional) {
      fail(`the required ${key} follows the optional ${optional}`);
    }
    if (variadic && index < keys.length - 1) {
      fail(`the variadic ${key} is not the last argument`);
    }
    optional ??= required ? undefined : key;
  }
}

/** The Commander argument of a task argument, i.e. `<from>`, `[to]` or `[rates...]`. */
function taskArgument(key: string, argument: TaskArgument): Argument {
  const name = `${kebabCase(key)}${argument.variadic ? '...' : ''}`;
  const result = new Argument(
    argument.required ? `<${name}>` : `[${name}]`,
    argument.description
  );
  if (argument.default !== undefined) {
    result.default(argument.default);
  }
  if (argument.choices) {
    result.choices(argument.choices);
  } else if (argument.type === 'number') {
    result.argParser(
      argument.variadic
        ? // Commander passes the default as the first previous value
          (value: string, previous: unknown) => [
            ...(Array.isArray(previous) && previous !== argument.default
              ? previous
              : []),
            parseNumber(value)
          ]
        : parseNumber
    );
  }
  return result;
}

/** The Commander option of a task option, i.e. `--dry-run` or `--limit <limit>`. */
function taskOption(key: string, option: TaskOption): Option {
  const flag = `--${kebabCase(key)}`;
  const result = new Option(
    option.type === 'boolean' ? flag : `${flag} <${kebabCase(key)}>`,
    option.description
  );
  if (option.default !== undefined) {
    result.default(option.default);
  }
  if (option.choices) {
    result.choices(option.choices);
  } else if (option.type === 'number') {
    result.argParser(parseNumber);
  }
  if (option.required) {
    result.makeOptionMandatory();
  }
  return result;
}

/** Parses a number, failing for any other value. */
function parseNumber(value: string): number {
  const number = Number(value);
  if (value.trim() === '' || Number.isNaN(number)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return number;
}

/** The kebab-case of a camelCase name, i.e. `dryRun` is `dry-run`. */
function kebabCase(name: string): string {
  return camelToSnakeCase(name, '-');
}
