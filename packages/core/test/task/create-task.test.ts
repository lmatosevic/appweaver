import { TASK, createTask, isTask } from '../../task/create-task';

describe('create-task', () => {
  describe('createTask', () => {
    test('creates a frozen task marked as a task', () => {
      const run = jest.fn();
      const task = createTask({ name: 'report', description: 'Report.', run });

      expect(task).toEqual({
        name: 'report',
        description: 'Report.',
        run,
        [TASK]: true
      });
      expect(Object.isFrozen(task)).toBe(true);
    });

    test('types the values of the arguments and the options from their declarations', () => {
      const task = createTask({
        arguments: {
          from: { required: true },
          to: {},
          months: { type: 'number', default: 12 },
          period: { choices: ['monthly', 'yearly'], default: 'yearly' },
          rates: { type: 'number', variadic: true }
        },
        options: {
          dryRun: { type: 'boolean' },
          limit: { type: 'number' },
          format: { choices: ['table', 'csv'], required: true }
        },
        run: ({ args, options, argv }) => {
          const from: string = args.from;
          const to: string | undefined = args.to;
          const months: number = args.months;
          const period: 'monthly' | 'yearly' = args.period;
          const rates: number[] = args.rates;
          const dryRun: boolean = options.dryRun;
          const limit: number | undefined = options.limit;
          const format: 'table' | 'csv' = options.format;
          const given: string[] = argv;
          // @ts-expect-error an optional argument may be missing
          const missing: string = args.to;
          // @ts-expect-error an undeclared argument
          void args.other;
          return [from, to, months, period, rates, dryRun, limit, format];
        }
      });

      const context = {
        args: {
          from: 'a',
          to: undefined,
          months: 12,
          period: 'yearly',
          rates: [1]
        },
        options: { dryRun: false, limit: undefined, format: 'csv' },
        argv: []
      };
      expect(task.run(context as never)).toEqual([
        'a',
        undefined,
        12,
        'yearly',
        [1],
        false,
        undefined,
        'csv'
      ]);
    });

    test('rejects a default of a required argument in the types', () => {
      const task = createTask({
        // @ts-expect-error the default of a required argument is never used
        arguments: { amount: { required: true, default: '1' } },
        run: () => 0
      });

      expect(task.arguments).toEqual({
        amount: { required: true, default: '1' }
      });
    });
  });

  describe('isTask', () => {
    test('recognizes a created task', () => {
      expect(isTask(createTask({ run: () => 0 }))).toBe(true);
    });

    test('recognizes a task of another copy of the package by its global symbol', () => {
      expect(isTask({ [Symbol.for('appweaver.task')]: true })).toBe(true);
    });

    test.each([null, undefined, () => 0, { run: () => 0 }, 'task'])(
      'rejects %p',
      (value) => {
        expect(isTask(value)).toBe(false);
      }
    );
  });
});
