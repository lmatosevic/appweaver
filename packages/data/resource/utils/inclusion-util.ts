import {
  capitalize,
  isPlainObject,
  isRelationArray,
  uncapitalize
} from '@appweaver/common';
import { injectModel } from '@appweaver/core';
import { matchesWhere } from './where-util';

type Where = Record<string, any>;

/** The read restrictions of the related models of an inclusion, by model name, the models without any left out. */
export type InclusionRestrictions = Map<string, Where>;

/** Reads the read restrictions of a model for the current user, or none. */
export type RestrictionsOf = (modelName: string) => Promise<Where | undefined>;

/** Reads the ids of the records of a model matching a filter. */
export type MatchingIds = (
  modelKey: string,
  where: Where
) => Promise<Array<{ id: unknown }>>;

/**
 * Restricts the relations of an `include` clause to the related records the read restrictions of their policies let
 * the current user read (F57): a list relation and a relation count read only those, and the restrictions of the
 * single relations, which Prisma cannot filter while it reads them, are returned for
 * {@link hideRestrictedRelations}.
 *
 * @param {Object} include - The `include` clause of `mapRelationInclusions`.
 * @param {string} resourceName - The model the clause reads the relations of.
 * @param {RestrictionsOf} restrictionsOf - Reads the restrictions of a related model.
 * @return {Promise<Object>} The restricted clause, and the restrictions of every related model having some.
 */
export async function restrictInclusions(
  include: Where,
  resourceName: string,
  restrictionsOf: RestrictionsOf
): Promise<{ include: Where; restrictions: InclusionRestrictions }> {
  const restrictions: InclusionRestrictions = new Map();
  const read = new Map<string, Where | undefined>();
  const restrictionOf = async (model: string) => {
    if (!read.has(model)) {
      const where = await restrictionsOf(model);
      read.set(
        model,
        where && Object.keys(where).length > 0 ? where : undefined
      );
    }
    const where = read.get(model);
    if (where) {
      restrictions.set(model, where);
    }
    return where;
  };

  const restrict = async (clause: Where, modelName: string): Promise<Where> => {
    const relations = injectModel(modelName, false)?.config?.relations ?? {};
    const restricted: Where = { ...clause };

    for (const [key, value] of Object.entries(clause)) {
      const relation = relations[key];
      if (key === '_count' || !relation || !value) {
        continue;
      }
      const related = capitalize(relation.model);
      const where = await restrictionOf(related);
      const nested = isPlainObject(value) ? (value as Where) : {};
      const next: Where = { ...nested };
      if (nested.include) {
        next.include = await restrict(nested.include as Where, related);
      }
      if (where && isRelationArray(relation)) {
        next.where = nested.where ? { AND: [nested.where, where] } : where;
      }
      restricted[key] = Object.keys(next).length > 0 ? next : true;
    }

    const counts = (clause._count as Where | undefined)?.select as
      | Where
      | undefined;
    if (counts) {
      const select: Where = {};
      for (const [key, value] of Object.entries(counts)) {
        const relation = relations[key];
        const where = relation
          ? await restrictionOf(capitalize(relation.model))
          : undefined;
        const current = isPlainObject(value)
          ? ((value as Where).where as Where | undefined)
          : undefined;
        select[key] = where
          ? { where: current ? { AND: [current, where] } : where }
          : value;
      }
      restricted._count = { select };
    }

    return restricted;
  };

  return { include: await restrict(include, resourceName), restrictions };
}

/**
 * Replaces with null the records of the single relations of the given records that the read restrictions of their
 * policies hide from the current user, recursively. A restriction matched in memory decides at once; one only the
 * database can match (a relation filter) is checked with one query per related model. The records are not changed:
 * the ones holding a hidden relation are copied.
 *
 * @param {Array<Object>} records - The records read with a clause of {@link restrictInclusions}.
 * @param {string} resourceName - The model of the records.
 * @param {InclusionRestrictions} restrictions - The restrictions of the related models.
 * @param {MatchingIds} matchingIds - Reads the ids of the related records matching their restrictions.
 * @return {Promise<Array<Object>>} The records, the hidden relations set to null.
 */
export async function hideRestrictedRelations<T>(
  records: T[],
  resourceName: string,
  restrictions: InclusionRestrictions,
  matchingIds: MatchingIds
): Promise<T[]> {
  if (restrictions.size === 0) {
    return records;
  }

  // The relations to clear, by the object holding them
  const hidden = new Map<object, Set<string>>();
  const hide = (parent: object, key: string) =>
    hidden.set(parent, (hidden.get(parent) ?? new Set()).add(key));
  // The single relations the database decides, by related model
  const pending = new Map<
    string,
    Array<{ parent: Where; key: string; id: unknown }>
  >();

  const walk = (record: unknown, modelName: string) => {
    if (!isPlainObject(record)) {
      return;
    }
    const parent = record as Where;
    const relations = injectModel(modelName, false)?.config?.relations ?? {};
    for (const [key, relation] of Object.entries(relations)) {
      const value = parent[key];
      const related = capitalize(relation.model);
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, related));
        continue;
      }
      if (!isPlainObject(value)) {
        continue;
      }
      const where = restrictions.get(related);
      const matched = where ? matchesWhere(value as Where, where) : true;
      if (matched === false) {
        hide(parent, key);
        continue;
      }
      if (matched === undefined) {
        const list = pending.get(related) ?? [];
        list.push({ parent, key, id: (value as Where).id });
        pending.set(related, list);
      }
      walk(value, related);
    }
  };

  records.forEach((record) => walk(record, resourceName));

  for (const [related, entries] of pending) {
    const ids = [...new Set(entries.map((entry) => entry.id))];
    const allowed = new Set(
      (
        await matchingIds(uncapitalize(related), {
          AND: [{ id: { in: ids } }, restrictions.get(related)!]
        })
      ).map((row) => row.id)
    );
    for (const { parent, key, id } of entries) {
      if (!allowed.has(id)) {
        hide(parent, key);
      }
    }
  }

  if (hidden.size === 0) {
    return records;
  }
  const copy = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const items = value.map(copy);
      return items.some((item, index) => item !== value[index]) ? items : value;
    }
    if (!isPlainObject(value)) {
      return value;
    }
    const object = value as Where;
    let copied: Where | undefined;
    for (const [key, field] of Object.entries(object)) {
      const next = hidden.get(object)?.has(key) ? null : copy(field);
      if (next !== field) {
        copied ??= { ...object };
        copied[key] = next;
      }
    }
    return copied ?? object;
  };
  return records.map((record) => copy(record) as T);
}
