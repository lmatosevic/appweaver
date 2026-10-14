/**
 * A Swagger UI plugin stubbing the references between the query filter
 * schemas of the document the UI displays. Every filter refers to the filters
 * of its relations, which in turn refer back to it, and Swagger UI inlines
 * every reference of an operation it opens except the ones repeating an
 * ancestor, so a single query or aggregate operation expanded to tens of
 * megabytes and froze the page for seconds. A filter keeps its own fields and
 * logical operators, while a nested filter is shown as an object titled after
 * the schema it stands for, listed in full among the schemas. Only the copy of
 * the UI changes, the served document keeps every reference.
 *
 * The UI receives the plugin as source code, so it must not refer to anything
 * outside its own body.
 *
 * @return {Object} The Swagger UI plugin.
 */
export function swaggerUiFilterPlugin(): any {
  const SCHEMAS_PREFIX = '#/components/schemas/';

  const stubNestedFilters = (spec: any): any => {
    const schemas = spec?.components?.schemas;
    if (!schemas || typeof schemas !== 'object') {
      return spec;
    }

    // Registered under generated names, so recognized by their title
    const filters = new Map<string, string>();
    for (const [name, schema] of Object.entries<any>(schemas)) {
      if (/QueryFilter$/.test(schema?.title ?? '')) {
        filters.set(`${SCHEMAS_PREFIX}${name}`, schema.title);
      }
    }

    const visit = (node: any, own: string): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) visit(item, own);
        return;
      }

      const title = filters.get(node.$ref);
      if (title && node.$ref !== own) {
        delete node.$ref;
        node.type = 'object';
        node.title = title;
        node.description ??= `A nested ${title}, see its schema`;
        return;
      }

      for (const value of Object.values(node)) {
        visit(value, own);
      }
    };

    for (const ref of filters.keys()) {
      visit(schemas[ref.slice(SCHEMAS_PREFIX.length)], ref);
    }
    return spec;
  };

  return {
    statePlugins: {
      spec: {
        wrapActions: {
          updateJsonSpec:
            (updateJsonSpec: (spec: any) => any) =>
            (spec: any): any =>
              updateJsonSpec(stubNestedFilters(spec))
        }
      }
    }
  };
}
