import { Application, createApp } from '@appweaver/core';
import amortize from '@/tasks/amortize';
import compare from '@/tasks/compare';

/** Runs the tasks the way `weaver run` does, with the application created, collecting what they print. */
describe('Tasks', () => {
  let app: Application;
  let output: string[];

  /** The context `weaver run` gives a task, with the parsed arguments and options. */
  const context = (args: object, options: object = {}) =>
    ({ args, options: { monthly: false, ...options }, argv: [] }) as never;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  beforeEach(() => {
    output = [];
    const collect = (...parts: unknown[]) => {
      output.push(parts.join(' '));
    };
    jest.spyOn(console, 'log').mockImplementation(collect);
    jest.spyOn(console, 'error').mockImplementation(collect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('amortize', () => {
    test('prints the yearly schedule with the configured defaults', async () => {
      expect(await amortize.run(context({ principal: 200000 }))).toBe(0);

      expect(output[0]).toBe(
        '€200,000.00 at 5% over 360 months: €1,073.64 a month\n'
      );
      const table = output[1].split('\n');
      expect(table[0]).toMatch(
        /^Year\s+Payment\s+Principal\s+Interest\s+Balance$/
      );
      expect(table).toHaveLength(31);
      expect(table.at(-1)).toMatch(/^30 .* €0\.00$/);
      expect(output[2]).toMatch(
        /^\nTotal paid €386,51\d\.\d\d, interest €186,51\d\.\d\d$/
      );
    });

    test('prints every month of the given terms', async () => {
      expect(
        await amortize.run(
          context({ principal: 12000, rate: 12, months: 12 }, { monthly: true })
        )
      ).toBe(0);

      const table = output[1].split('\n');
      expect(table[0]).toMatch(/^Month /);
      expect(table[1]).toMatch(
        /^1\s+€1,066\.19\s+€946\.19\s+€120\.00\s+€11,053\.81$/
      );
      expect(table).toHaveLength(13);
    });

    test('reports the invalid terms', async () => {
      expect(
        await amortize.run(context({ principal: 200000, rate: 5, months: 700 }))
      ).toBe(1);

      expect(output).toEqual([
        'Invalid loan terms: the term must be between 1 and 600 months'
      ]);
    });
  });

  describe('compare', () => {
    test('compares the rates from the cheapest', async () => {
      expect(
        await compare.run(
          context({ principal: 10000, months: 36, rates: [7.5, 4, 5.25] })
        )
      ).toBe(0);

      const rows = output[0].split('\n');
      expect(rows.map((row) => row.split(/\s+/)[0])).toEqual([
        'Rate',
        '4%',
        '5.25%',
        '7.5%'
      ]);
      expect(rows[1]).toMatch(/€0\.00$/);
    });
  });
});
