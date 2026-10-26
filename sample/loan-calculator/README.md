# Loan Calculator

> Appweaver sample - Loan calculator, a minimal application of the core module

The smallest Appweaver application: `@appweaver/core`, `@appweaver/common` and `@appweaver/cli`, with neither a
database nor a server. It calculates the amortization schedule of a loan, compares interest rates, and prints the
results from one-shot tasks, showing that the framework's modules, config, dependency injection and lifecycle work the
same without `@appweaver/data` and `@appweaver/web`.

Created with `npm create @appweaver loan-calculator`, without any `--add`.

## What it showcases

| Feature                                                                              | Where                                                                    |
|--------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| A minimal scaffolded application: core, common and the CLI only                      | [`package.json`](package.json)                                           |
| A local module (`weaver module new loan`) with its manifest, config section and main | [`modules/loan/module.ts`](src/modules/loan/module.ts)                   |
| A validated config section (`loan.*`, `LOAN_*`) checked by `weaver config check`     | [`modules/loan/config.ts`](src/modules/loan/config.ts)                   |
| A service class of the module, injected with `inject(LoanCalculator)`                | [`modules/loan/loan-calculator.ts`](src/modules/loan/loan-calculator.ts) |
| The in-process `Cache` of core, keeping the calculated schedules                     | [`modules/loan/loan-calculator.ts`](src/modules/loan/loan-calculator.ts) |
| An application error code of its own (`defineErrors`), without an API to map it     | [`modules/loan/errors.ts`](src/modules/loan/errors.ts)                   |
| One-shot tasks with arguments and an exit code (`weaver run`)                        | [`tasks/`](src/tasks/amortize.ts)                                        |
| An application that starts, does its work and stops by itself                        | [`main.ts`](src/main.ts)                                                 |
| Pure calculations in cents, unit tested without the application                      | [`modules/loan/amortization.ts`](src/modules/loan/amortization.ts)       |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env   # NODE_ENV=dev
npm run build
npm start              # calculates an example loan with the configured defaults, then exits
```

## Try it out

```bash
# The schedule of 150,000 at 4.2% over 10 years, summed by year
npx weaver run src/tasks/amortize.ts 150000 4.2 120

# Every month of a one-year loan
npx weaver run src/tasks/amortize.ts 12000 12 12 monthly

# The rate and the term default to the loan config: 5% over 360 months
npx weaver run src/tasks/amortize.ts 200000

# The cost of 300,000 over 30 years at three rates, from the cheapest
npx weaver run src/tasks/compare.ts 300000 360 3.9 4.5 5.1

# Invalid terms are reported with exit code 1
npx weaver run src/tasks/amortize.ts 1000 -1; echo $?

# The config is validated: the currency must be an ISO 4217 code
LOAN_CURRENCY=euro npx weaver config check
LOAN_CURRENCY=USD npx weaver run src/tasks/amortize.ts 200000
```

On Node, `weaver run` runs the build output of a task (`dist/src/tasks/amortize.js`), so run `npm run build` after a
change.

## Tests

```bash
npm run test  # unit tests of the calculations and the formatting
npm run e2e   # the tasks, run with the application
```

## License

UNLICENSED
