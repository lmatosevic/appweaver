import { uncapitalize } from '@appweaver/common';

export type DelegateMethod =
  | 'findFirst'
  | 'findMany'
  | 'count'
  | 'create'
  | 'update'
  | 'delete'
  | 'aggregate';

export type RecordedQuery = {
  model: string;
  method: DelegateMethod;
  args: any;
};

const METHODS: DelegateMethod[] = [
  'findFirst',
  'findMany',
  'count',
  'create',
  'update',
  'delete',
  'aggregate'
];

export type DatabaseStub = {
  /** Stands in for the injected `PrismaDatabase`. */
  database: { client: () => any };
  /** Every query executed against the stub, in order. */
  queries: RecordedQuery[];
  /** Sets the result (value, error or factory) of a delegate method. */
  setResult: (
    model: string,
    method: DelegateMethod,
    result: any | ((args: any) => any)
  ) => void;
  /** Returns the last recorded query, optionally filtered by method. */
  lastQuery: (method?: DelegateMethod) => RecordedQuery;
  /** Resets the recorded queries and the configured results. */
  reset: () => void;
};

/**
 * Creates a Prisma client stub that records the executed queries and returns
 * configured results. Model delegates are exposed under both their capitalized
 * and uncapitalized names, and transactions are executed inline, matching the
 * behaviour the resource service relies on.
 */
export function createDatabaseStub(modelNames: string[]): DatabaseStub {
  const queries: RecordedQuery[] = [];
  const results = new Map<string, any>();

  const createDelegate = (modelName: string) => {
    const delegate: Record<string, any> = { name: modelName };

    for (const method of METHODS) {
      delegate[method] = async (args: any) => {
        queries.push({ model: modelName, method, args });

        const result = results.get(`${modelName}.${method}`);
        if (result instanceof Error) {
          throw result;
        }
        if (typeof result === 'function') {
          return result(args);
        }
        return result;
      };
    }

    return delegate;
  };

  const client: Record<string, any> = {
    $transaction: async (operations: any) =>
      Array.isArray(operations)
        ? Promise.all(operations)
        : operations(client as any)
  };

  for (const modelName of modelNames) {
    const delegate = createDelegate(modelName);
    client[modelName] = delegate;
    client[uncapitalize(modelName)] = delegate;
  }

  return {
    database: { client: () => client },
    queries,
    setResult: (model, method, result) =>
      results.set(`${model}.${method}`, result),
    lastQuery: (method) => {
      const filtered = method
        ? queries.filter((query) => query.method === method)
        : queries;
      return filtered[filtered.length - 1];
    },
    reset: () => {
      queries.length = 0;
      results.clear();
    }
  };
}
