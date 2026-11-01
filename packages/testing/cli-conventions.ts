/** The short flags of the Appweaver CLIs, each with its one meaning, `-o` for the one output of a command. */
const SHORT_FLAGS: Record<string, RegExp> = {
  '-h': /^--help$/,
  '-v': /^--version$/,
  '-o': /^--output-(path|dir)$/,
  '-p': /^--project$/,
  '-w': /^--watch$/,
  '-y': /^--yes$/,
  '-f': /^--force$/
};

/** The flags closing the options of a command, in this order. */
const TRAILING_FLAGS = ['--dry-run', '--yes', '--force', '--verbose'];

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DESCRIPTION_END = /[.)]$/;

/** The parts of a Commander option the conventions check. */
type CliOption = {
  flags: string;
  description: string;
  short?: string;
  long?: string;
  optional: boolean;
};

/** The parts of a Commander command the conventions check, structural so no Commander copy is required. */
type CliCommand = {
  options: readonly CliOption[];
  commands: readonly CliCommand[];
  registeredArguments: readonly { description: string; name(): string }[];
  name(): string;
  description(): string;
};

/**
 * Returns the violations of the CLI conventions by a Commander program and its subcommands: kebab-case long flags and
 * value placeholders, a required value (`<path>`, never `[path]`), the reserved short flags only, each with its one
 * meaning (`-o` output, `-p` project, `-w` watch, `-y` yes, `-f` force), `--dry-run`, `--yes`, `--force` and
 * `--verbose` closing the options in this order, and a description ending with a period on every command, argument
 * and option.
 *
 * @example
 * expect(cliConventionViolations(program)).toEqual([]);
 *
 * @param {CliCommand} program - The program, checked with every nested subcommand.
 * @return {string[]} One message per violation, empty when the program follows the conventions.
 */
export function cliConventionViolations(program: CliCommand): string[] {
  const violations: string[] = [];
  const visit = (command: CliCommand, path: string) => {
    if (!DESCRIPTION_END.test(command.description())) {
      violations.push(`${path}: the description ends without a period`);
    }
    for (const argument of command.registeredArguments) {
      const name = argument.name();
      if (!KEBAB_CASE.test(name)) {
        violations.push(`${path} <${name}>: the name is not kebab-case`);
      }
      if (!DESCRIPTION_END.test(argument.description)) {
        violations.push(
          `${path} <${name}>: the description ends without a period`
        );
      }
    }

    const longs = command.options.map((option) => option.long ?? '');
    for (const option of command.options) {
      const flag = `${path} ${option.long}`;
      const name = (option.long ?? '').replace(/^--(no-)?/, '');
      if (!KEBAB_CASE.test(name)) {
        violations.push(`${flag}: the flag is not kebab-case`);
      }
      if (option.short && !SHORT_FLAGS[option.short]?.test(option.long ?? '')) {
        violations.push(
          `${flag}: ${option.short} is reserved for another flag`
        );
      }
      if (option.optional) {
        violations.push(
          `${flag}: the value is optional, declare it as <value>`
        );
      }
      const placeholder = option.flags.match(/[<[]([^>\]]+)[>\]]/)?.[1];
      if (placeholder && !KEBAB_CASE.test(placeholder.replace(/\.\.\.$/, ''))) {
        violations.push(
          `${flag}: the placeholder <${placeholder}> is not kebab-case`
        );
      }
      if (!DESCRIPTION_END.test(option.description)) {
        violations.push(`${flag}: the description ends without a period`);
      }
    }

    const trailing = longs.filter((long) => TRAILING_FLAGS.includes(long));
    const expected = TRAILING_FLAGS.filter((long) => trailing.includes(long));
    if (
      trailing.join() !== expected.join() ||
      longs.slice(longs.length - trailing.length).join() !== trailing.join()
    ) {
      violations.push(
        `${path}: ${expected.join(', ')} must close the options in this order`
      );
    }

    for (const subcommand of command.commands) {
      visit(subcommand, `${path} ${subcommand.name()}`);
    }
  };
  visit(program, program.name());
  return violations;
}
