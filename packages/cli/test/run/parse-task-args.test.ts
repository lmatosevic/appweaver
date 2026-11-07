import { Command } from 'commander';
import { createTask } from '@appweaver/core';
import { TaskError, parseTaskArgs, taskCommand } from '../../run';

const report = createTask({
  description: 'Prints the report of a period.',
  arguments: {
    from: { description: 'The first day.', required: true },
    to: { description: 'The last day.' },
    categories: { variadic: true }
  },
  options: {
    format: { choices: ['table', 'csv'], default: 'table' },
    limit: { type: 'number' },
    dryRun: { type: 'boolean', description: 'Print without saving.' },
    owner: { required: true }
  },
  run: () => 0
});

/** Parses the arguments, capturing what the command writes. */
function parse(task: Parameters<typeof parseTaskArgs>[1], argv: string[]) {
  const output: string[] = [];
  const stdout = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((text) => !!output.push(String(text)));
  const stderr = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((text) => !!output.push(String(text)));
  try {
    return { result: parseTaskArgs('report', task, argv), output };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

describe('parse-task-args', () => {
  describe('taskCommand', () => {
    test('shows the arguments and the options of the task in its help', () => {
      const help = taskCommand('report', report).helpInformation();

      expect(help).toContain(
        'Usage: weaver run report [options] <from> [to] [categories...]'
      );
      expect(help).toContain('Prints the report of a period.');
      expect(help).toContain('from');
      expect(help).toContain('--format <format>');
      expect(help).toContain('--limit <limit>');
      expect(help).toContain('--dry-run');
      expect(help).toContain('Print without saving.');
      expect(help).not.toContain('(default: false)');
      expect(help).toContain('-h, --help');
    });

    test.each([
      [
        { 1: {}, amount: {} },
        'the name 1 is a number, ordered before the other names'
      ],
      [
        { amount: { required: true, default: 1 } },
        'the required amount has a default that is never used'
      ],
      [
        { rates: { variadic: true }, amount: {} },
        'the variadic rates is not the last argument'
      ],
      [
        { from: {}, to: { required: true } },
        'the required to follows the optional from'
      ]
    ])('fails for invalid arguments %j, naming the task', (args, reason) => {
      const task = { run: () => 0, arguments: args } as never;

      expect(() => taskCommand('report', task)).toThrow(
        new TaskError(`The task report declares invalid arguments: ${reason}`)
      );
    });

    test('takes required arguments before the optional and variadic ones', () => {
      const task = createTask({
        arguments: {
          principal: { required: true, type: 'number' },
          months: { required: true },
          rate: { default: 5 },
          extra: { variadic: true }
        },
        run: () => 0
      });

      expect(() => taskCommand('loan', task)).not.toThrow();
    });
  });

  describe('parseTaskArgs', () => {
    test('parses the declared arguments and options', () => {
      const argv = [
        '2026-10-01',
        '2026-10-31',
        'food',
        'rent',
        '--format',
        'csv',
        '--limit',
        '5',
        '--dry-run',
        '--owner',
        'luka'
      ];

      const { result } = parse(report, argv);

      expect(result).toEqual({
        context: {
          args: {
            from: '2026-10-01',
            to: '2026-10-31',
            categories: ['food', 'rent']
          },
          options: { format: 'csv', limit: 5, dryRun: true, owner: 'luka' },
          argv
        }
      });
    });

    test('gives the defaults of the missing arguments and options', () => {
      const { result } = parse(report, ['2026-10-01', '--owner', 'luka']);

      expect(result).toEqual({
        context: expect.objectContaining({
          args: { from: '2026-10-01', to: undefined, categories: [] },
          options: {
            format: 'table',
            limit: undefined,
            dryRun: false,
            owner: 'luka'
          }
        })
      });
    });

    test('parses the numbers of a variadic argument', () => {
      const task = createTask({
        arguments: {
          rates: { type: 'number', variadic: true, default: [1] }
        },
        run: () => 0
      });

      expect(parse(task as never, ['3.9', '4.5']).result).toEqual({
        context: expect.objectContaining({ args: { rates: [3.9, 4.5] } })
      });
      expect(parse(task as never, []).result).toEqual({
        context: expect.objectContaining({ args: { rates: [1] } })
      });
    });

    test('takes any argument and option of a task declaring none', () => {
      const task = createTask({ run: () => 0 });
      const argv = ['one', '--two', '3'];

      expect(parse(task as never, argv).result).toEqual({
        context: { args: {}, options: {}, argv }
      });
    });

    test('shows the help with exit code 0', () => {
      const { result, output } = parse(report, ['--help']);

      expect(result).toEqual({ exitCode: 0 });
      expect(output.join('')).toContain('Usage: weaver run report');
    });

    test.each([
      [['--owner', 'a'], "missing required argument 'from'"],
      [['2026-10-01'], "required option '--owner <owner>' not specified"],
      [['2026-10-01', '--owner', 'a', '--format', 'xml'], 'Allowed choices'],
      [['2026-10-01', '--owner', 'a', '--limit', 'ten'], 'Not a number.'],
      [
        ['2026-10-01', '--owner', 'a', '--unknown'],
        "unknown option '--unknown'"
      ]
    ])('fails with exit code 1 for invalid arguments %j', (argv, message) => {
      const { result, output } = parse(report, argv);

      expect(result).toEqual({ exitCode: 1 });
      expect(output.join('')).toContain(message);
      expect(output.join('')).toContain('weaver run report --help');
    });

    test('fails for an argument that is not a number', () => {
      const task = createTask({
        arguments: { amount: { type: 'number', required: true } },
        run: () => 0
      });

      const { result, output } = parse(task, ['many']);

      expect(result).toEqual({ exitCode: 1 });
      expect(output.join('')).toContain('Not a number.');
    });

    test('fails for an excess argument of a task declaring its arguments', () => {
      const task = createTask({
        arguments: { amount: { required: true } },
        run: () => 0
      });

      expect(parse(task as never, ['1', '2']).result).toEqual({ exitCode: 1 });
    });

    test('fails for two options of the same flag', () => {
      const task = createTask({
        options: {
          dryRun: { type: 'boolean' },
          'dry-run': { type: 'boolean' }
        },
        run: () => 0
      });

      expect(() => parse(task as never, [])).toThrow('--dry-run');
    });

    test('rethrows an error that is not of the command', () => {
      const parseSpy = jest
        .spyOn(Command.prototype, 'parse')
        .mockImplementation(() => {
          throw new Error('Parse failed');
        });
      try {
        expect(() => parse(report as never, [])).toThrow('Parse failed');
      } finally {
        parseSpy.mockRestore();
      }
    });
  });
});
