import {
  capitalize,
  isArray,
  isPlainObject,
  ReferencingRelation,
  referencingRelations,
  ResourceId,
  ResourceModel,
  uncapitalize
} from '@appweaver/common';
import { context, injectModel } from '../../context';
import { currentAuthUser, resourceAuthModel } from '../../security';
import { HttpError } from '../../errors';
import {
  deletedResourceFileFields,
  isSoftDeleteModel,
  liveRecordFilter
} from '../../utils';
import type { RelationActions } from './relation-util';

/** The records of every model affected by a delete, keyed by model name. */
export type AffectedRecords = Record<string, ResourceId[]>;

/** The records deleted by one action, split by how they were deleted. */
export type DeletedRecords = {
  /** Records marked with the soft delete columns */
  soft: AffectedRecords;
  /** Records removed from the database */
  hard: AffectedRecords;
};

/** A referencing relation visited by the walk, with the referenced records. */
type VisitedRelation = ReferencingRelation & {
  /** The ids of the referenced records */
  ids: ResourceId[];
  /** The name of the model of the referenced records */
  referencedName: string;
};

/** The columns marking a record as soft deleted. */
export type SoftDeleteData = {
  deletedAt: Date;
  deletedById?: ResourceId | null;
};

/** The condition matching the records that are not soft deleted. */
const LIVE_RECORD = Object.freeze({ deletedAt: null });

/** The condition matching the soft deleted records. */
const DELETED_RECORD = Object.freeze({ deletedAt: { not: null } });

/** Referential actions that prevent deleting a record while others reference it. */
const RESTRICTING_ACTIONS = ['restrict', 'noAction'];

/**
 * Restricts a mapped relation filter to the related records that are not soft deleted, so a filter never matches
 * through a deleted record, and a null check treats a deleted related record as missing.
 *
 * @param {*} condition - The mapped database condition of the relation field.
 * @param {string} resourceName - The name of the related model.
 * @param {boolean} isArrayType - Whether the relation is a list (to-many) relation.
 * @return {*} The condition restricted to the live related records, or unchanged if the related model does not soft
 * delete its records.
 */
export function liveRelationFilter(
  condition: any,
  resourceName: string,
  isArrayType: boolean
): any {
  if (!isSoftDeleteModel(resourceName)) {
    return condition;
  }

  if (isArrayType) {
    if (!isPlainObject(condition)) {
      return condition;
    }

    const mapped = { ...condition };
    for (const quantifier of ['some', 'none']) {
      if (mapped[quantifier] !== undefined) {
        mapped[quantifier] = { AND: [mapped[quantifier], LIVE_RECORD] };
      }
    }
    if (mapped.every !== undefined) {
      mapped.every = { OR: [mapped.every, DELETED_RECORD] };
    }
    return mapped;
  }

  if (condition === null) {
    return { isNot: LIVE_RECORD };
  }
  if (!isPlainObject(condition)) {
    return condition;
  }

  const { is, isNot, ...fields } = condition;
  const matches: any[] = [];
  const mapped: Record<string, any> = {};

  if (is === null) {
    mapped.isNot = LIVE_RECORD;
  } else if (is !== undefined) {
    matches.push(is);
  }

  if (isNot === null) {
    matches.push({});
  } else if (isNot !== undefined) {
    mapped.isNot = { AND: [isNot, LIVE_RECORD] };
  }

  // The fields given without `is` are its shorthand
  if (Object.keys(fields).length > 0) {
    matches.push(fields);
  }

  if (matches.length > 0) {
    mapped.is = { AND: [...matches, LIVE_RECORD] };
  }

  return mapped;
}

/**
 * Builds the inclusion filter of a list relation, so only the related records that are not soft deleted are read.
 *
 * @param {string} [resourceName] - The name of the related model.
 * @return {Object|undefined} The `where` clause of the inclusion, or undefined if the related model does not soft
 * delete its records.
 */
export function liveInclusionFilter(
  resourceName?: string
): { where: Record<string, any> } | undefined {
  return isSoftDeleteModel(resourceName)
    ? { where: { ...LIVE_RECORD } }
    : undefined;
}

/**
 * Replaces the soft deleted records in the single relations of a resource with null, recursively. Unlike the list
 * relations, a single relation cannot be filtered when it is read.
 *
 * @param {Object} resource - The resource as returned by the database client.
 * @param {string} resourceName - The name of the model describing the resource.
 * @return {Object} A copy of the resource without the soft deleted related records, or the resource itself if it
 * holds no relations.
 */
export function hideDeletedRelations<T>(resource: T, resourceName: string): T {
  const relations = injectModel(resourceName, false)?.config?.relations;
  if (!isPlainObject(resource) || !relations) {
    return resource;
  }

  const projected = { ...resource } as Record<string, any>;

  for (const [key, relation] of Object.entries(relations)) {
    const value = projected[key];
    const relatedName = capitalize(relation.model);

    if (isArray(value)) {
      projected[key] = value.map((item: any) =>
        hideDeletedRelations(item, relatedName)
      );
    } else if (isPlainObject(value)) {
      projected[key] =
        value.deletedAt != null && isSoftDeleteModel(relatedName)
          ? null
          : hideDeletedRelations(value, relatedName);
    }
  }

  return projected as T;
}

/**
 * Builds the column values marking a record as soft deleted now by the current user, who is only recorded when the
 * application defines an auth model.
 *
 * @return {SoftDeleteData} The soft delete column values.
 */
export function softDeleteData(): SoftDeleteData {
  const data: SoftDeleteData = { deletedAt: new Date() };

  if (resourceAuthModel()) {
    data.deletedById = currentAuthUser()?.id ?? null;
  }

  return data;
}

/**
 * Mirrors the referential actions of a database delete for soft deleted records: cascading records are soft deleted
 * with the same column values, level by level, a restricting relation aborts the delete, and references set to null on
 * delete are kept for a manual restore. The records themselves are not updated.
 *
 * @param {Object} tx - The transaction client the delete runs in.
 * @param {string} resourceName - The name of the model of the deleted records.
 * @param {ResourceId[]} ids - The ids of the deleted records.
 * @param {SoftDeleteData} data - The soft delete column values applied to the cascaded records.
 * @return {Promise<AffectedRecords>} The ids of the soft deleted records per model, excluding the records themselves.
 * @throws {HttpError} 409 if a live record references a deleted record through a restricting relation.
 */
export async function softDeleteCascade(
  tx: any,
  resourceName: string,
  ids: ResourceId[],
  data: SoftDeleteData
): Promise<AffectedRecords> {
  return walkReferencingRecords(tx, resourceName, ids, async (relation) => {
    const client = tx[uncapitalize(relation.modelName)];
    const where = {
      [relation.foreignKey]: { in: relation.ids },
      ...liveRecordFilter(relation.modelName)
    };

    if (RESTRICTING_ACTIONS.includes(relation.onDelete)) {
      await assertNotReferenced(client, where, relation);
      return [];
    }

    if (relation.onDelete !== 'cascade') {
      return [];
    }

    // Loading validates every cascade of a soft deleted model, so this only
    // guards the models registered after it
    if (!isSoftDeleteModel(relation.modelName)) {
      throw new HttpError(
        `${relation.modelName} must enable soft delete to cascade from ${relation.referencedName}`,
        500
      );
    }

    const records = await client.findMany({ where, select: { id: true } });
    const cascadedIds = records.map((record: any) => record.id);
    if (cascadedIds.length > 0) {
      await client.updateMany({ where: { id: { in: cascadedIds } }, data });
    }
    return cascadedIds;
  });
}

/**
 * Collects the records the database cascade removes together with deleted records, so their files and caches can be
 * cleaned up once the delete commits.
 *
 * @param {Object} tx - The transaction client the delete runs in.
 * @param {string} resourceName - The name of the model of the deleted records.
 * @param {ResourceId[]} ids - The ids of the deleted records.
 * @return {Promise<AffectedRecords>} The ids of the cascaded records per model, excluding the records themselves.
 */
export async function cascadedRecords(
  tx: any,
  resourceName: string,
  ids: ResourceId[]
): Promise<AffectedRecords> {
  return walkReferencingRecords(tx, resourceName, ids, async (relation) => {
    if (relation.onDelete !== 'cascade') {
      return [];
    }

    // Soft deleted records are removed by the cascade as well
    const records = await tx[uncapitalize(relation.modelName)].findMany({
      where: { [relation.foreignKey]: { in: relation.ids } },
      select: { id: true }
    });
    return records.map((record: any) => record.id);
  });
}

/**
 * Removes the orphans an update maps to a nested `delete` action (`orphanRemoval`). Orphans of a soft deleted model are
 * soft deleted with their cascade and keep their references, so their `delete` action is dropped; the others are left
 * to the `delete` action, collecting the records its cascade removes.
 *
 * @param {Object} tx - The transaction client the update runs in.
 * @param {string} resourceName - The name of the model the relation actions belong to.
 * @param {RelationActions} relationActions - The mapped relation write actions, from which the nested `delete` actions
 * of the soft deleted orphans are removed.
 * @param {SoftDeleteData} data - The soft delete column values applied to the soft deleted orphans.
 * @return {Promise<DeletedRecords>} The ids of the soft deleted and the removed records per model.
 * @throws {HttpError} 409 if a live record references a soft deleted orphan through a restricting relation.
 */
export async function removeOrphans(
  tx: any,
  resourceName: string,
  relationActions: RelationActions,
  data: SoftDeleteData
): Promise<DeletedRecords> {
  const relations = injectModel(resourceName, false)?.config?.relations ?? {};
  const deleted: DeletedRecords = { soft: {}, hard: {} };

  for (const [key, actions] of Object.entries(relationActions)) {
    const relation = relations[key];
    if (!actions?.delete || !relation) {
      continue;
    }

    const relatedName = capitalize(relation.model);
    const client = tx[uncapitalize(relatedName)];

    const orphans = await client.findMany({
      where: { OR: asList(actions.delete) },
      select: { id: true }
    });
    const ids = orphans.map((orphan: any) => orphan.id);
    if (ids.length === 0) {
      continue;
    }

    if (isSoftDeleteModel(relatedName)) {
      // Left undefined rather than removed, so the raw input value of the
      // relation does not reach the database write in its place
      delete actions.delete;
      if (Object.keys(actions).length === 0) {
        relationActions[key] = undefined as any;
      }

      const cascaded = await softDeleteCascade(tx, relatedName, ids, data);
      await client.updateMany({ where: { id: { in: ids } }, data });

      mergeAffectedRecords(deleted.soft, { [relatedName]: ids }, cascaded);
    } else {
      const cascaded = await cascadedRecords(tx, relatedName, ids);
      mergeAffectedRecords(deleted.hard, { [relatedName]: ids }, cascaded);
    }
  }

  return deleted;
}

/**
 * Marks the file rows of the files the deleted records keep (`onResourceDeleted` / `onResourceSoftDeleted: 'keep'`) as
 * deleted with the values of the delete, so they stay stored, e.g. for audit, but are no longer served.
 *
 * @param {Object} tx - The transaction client the delete runs in.
 * @param {DeletedRecords} deleted - The soft deleted and the removed records.
 * @param {SoftDeleteData} data - The soft delete column values of the delete.
 * @return {Promise<void>} Resolves when the kept files are marked deleted.
 */
export async function retainDeletedFiles(
  tx: any,
  deleted: DeletedRecords,
  data: SoftDeleteData
): Promise<void> {
  const groups: [boolean, AffectedRecords][] = [
    [true, deleted.soft],
    [false, deleted.hard]
  ];

  for (const [softDeleted, records] of groups) {
    for (const [modelName, ids] of Object.entries(records)) {
      const files = injectModel(modelName, false)?.config.files;
      const { kept } = deletedResourceFileFields(files, softDeleted);
      if (kept.length === 0 || ids.length === 0) {
        continue;
      }

      await tx.file.updateMany({
        where: {
          resourceName: modelName,
          // Owning ids are stored as text, whatever the model primary key is
          resourceId: { in: ids.map(String) },
          resourceField: { in: kept },
          ...liveRecordFilter('File')
        },
        data
      });
    }
  }
}

/**
 * Merges the affected records of several deletes into the target, keeping the ids of every model unique.
 *
 * @param {AffectedRecords} target - The affected records merged into.
 * @param {AffectedRecords[]} sources - The affected records to add.
 * @return {AffectedRecords} The target holding the ids of every source.
 */
export function mergeAffectedRecords(
  target: AffectedRecords,
  ...sources: AffectedRecords[]
): AffectedRecords {
  for (const source of sources) {
    for (const [modelName, ids] of Object.entries(source)) {
      const seen = new Set((target[modelName] ?? []).map(String));
      target[modelName] = [
        ...(target[modelName] ?? []),
        ...ids.filter((id) => !seen.has(String(id)))
      ];
    }
  }
  return target;
}

/**
 * Rejects the relation write actions pointing at soft deleted records, which the database would otherwise connect or
 * update, since it does not know the record is deleted.
 *
 * @param {Object} client - The database client, or the transaction client the write runs in.
 * @param {string} resourceName - The name of the model the relation actions belong to.
 * @param {RelationActions} relationActions - The mapped relation write actions.
 * @return {Promise<void>} Resolves when no action points at a soft deleted record.
 * @throws {HttpError} 400 if a connect, update or connect-or-create action matches a soft deleted record.
 */
export async function assertLiveRelationTargets(
  client: any,
  resourceName: string,
  relationActions: RelationActions
): Promise<void> {
  const relations = injectModel(resourceName, false)?.config?.relations ?? {};

  for (const [key, actions] of Object.entries(relationActions)) {
    const relatedName = relations[key]?.model;
    if (!actions || !isSoftDeleteModel(relatedName)) {
      continue;
    }

    const matches = [
      ...asList(actions.connect).map((item) => ({ id: item.id })),
      ...asList(actions.update).map((item) => item.where),
      ...asList(actions.connectOrCreate).map((item) => item.where)
    ];
    if (matches.length === 0) {
      continue;
    }

    const deletedCount = await client[uncapitalize(relatedName)].count({
      where: { AND: [DELETED_RECORD, { OR: matches }] }
    });
    if (deletedCount > 0) {
      throw new HttpError(
        `${resourceName} relation '${key}' references a ${capitalize(relatedName)} record that does not exist`,
        400
      );
    }
  }
}

/** Wraps a single relation action value into a list. @internal */
function asList(value: any): any[] {
  return value === undefined ? [] : isArray(value) ? value : [value];
}

/**
 * Rejects a delete while records reference the deleted ones through a restricting relation.
 *
 * @internal
 */
async function assertNotReferenced(
  client: any,
  where: Record<string, any>,
  relation: VisitedRelation
): Promise<void> {
  const count = await client.count({ where });
  if (count > 0) {
    throw new HttpError(
      `${relation.referencedName} cannot be deleted while ${relation.modelName} records reference it`,
      409
    );
  }
}

/**
 * Walks the records referencing the given records breadth first. The visitor gets every referencing relation with the
 * referenced ids and returns the ids of the records the walk continues from.
 *
 * @internal
 */
async function walkReferencingRecords(
  tx: any,
  resourceName: string,
  ids: ResourceId[],
  visit: (relation: VisitedRelation) => Promise<ResourceId[]>
): Promise<AffectedRecords> {
  const models = Object.fromEntries(context.resource.models) as Record<
    string,
    ResourceModel
  >;

  const affected: AffectedRecords = {};
  const queue: { modelName: string; ids: ResourceId[] }[] = [
    { modelName: resourceName, ids }
  ];

  while (queue.length > 0) {
    const level = queue.shift()!;

    for (const relation of referencingRelations(models, level.modelName)) {
      const visitedIds = await visit({
        ...relation,
        ids: level.ids,
        referencedName: level.modelName
      });

      // A record reached twice, i.e. through a self relation, is walked once
      const seen = new Set((affected[relation.modelName] ?? []).map(String));
      if (relation.modelName === resourceName) {
        ids.forEach((id) => seen.add(String(id)));
      }
      const newIds = visitedIds.filter((value) => !seen.has(String(value)));

      if (newIds.length > 0) {
        affected[relation.modelName] = [
          ...(affected[relation.modelName] ?? []),
          ...newIds
        ];
        queue.push({ modelName: relation.modelName, ids: newIds });
      }
    }
  }

  return affected;
}
