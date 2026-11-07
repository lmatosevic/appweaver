import { ReferentialAction, ResourceModel } from '../types';
import {
  hasSoftDelete,
  isRelationOwner,
  isResourceAuthModel
} from './resource-util';
import { capitalize, uncapitalize } from './string-util';

/** A foreign key column of the generated schema, with its referential actions. */
export type ForeignKey = {
  /** Name of the model holding the foreign key column */
  modelName: string;
  /** Foreign key column name on that model */
  foreignKey: string;
  /** Name of the referenced model */
  referencedName: string;
  /** The action on delete the model asks for, with the database default resolved */
  onDelete: ReferentialAction;
  /** The action on update the model declares */
  onUpdate?: ReferentialAction;
  /** The action on delete the database runs */
  dbOnDelete: ReferentialAction;
  /** The action on update the database runs */
  dbOnUpdate: ReferentialAction;
};

/** A foreign key before its database actions are resolved, and the rank of its action. */
type ForeignKeyCandidate = Omit<ForeignKey, 'dbOnDelete' | 'dbOnUpdate'> & {
  /** The lower rank keeps its action first: 0 declared, 1 implicit, 2 file, 3 audit */
  rank: number;
};

const ACTING: ReadonlySet<ReferentialAction> = new Set([
  'cascade',
  'setNull',
  'setDefault'
]);

/**
 * Lists the foreign keys of the generated schema with the referential actions SQL Server runs. SQL Server rejects a
 * relation whose action on delete or on update forms a cycle, or a second path of actions between two tables, which
 * Prisma validates. Ids never change, so every action on update is `noAction` unless declared, the `createdBy` and
 * `deletedBy` relations to the auth model are `noAction`, and the other actions are kept in the order of their rank
 * while they form neither, the rest becoming `noAction`. The implicit join tables of the `manyToMany` relations always
 * cascade. A foreign key whose `dbOnDelete` is `noAction` while its `onDelete` is `cascade` or `setNull` is applied by
 * the data layer when the referenced records are deleted.
 *
 * @param {Record<string, ResourceModel>} models - All loaded models keyed by name.
 * @return {ForeignKey[]} The foreign keys of every model with their database actions.
 */
export function sqlServerForeignKeys(
  models: Record<string, ResourceModel>
): ForeignKey[] {
  const graph = new ActionGraph();
  for (const [from, to] of joinTableEdges(models)) {
    graph.add(from, to);
  }

  const candidates = foreignKeyCandidates(models);
  const ranked = [...candidates].sort((a, b) => a.rank - b.rank);
  const kept = new Set<ForeignKeyCandidate>();
  for (const candidate of ranked) {
    const acting =
      ACTING.has(candidate.onDelete) ||
      (candidate.onUpdate !== undefined && ACTING.has(candidate.onUpdate));
    if (
      candidate.rank < 3 &&
      acting &&
      graph.accepts(candidate.referencedName, candidate.modelName)
    ) {
      graph.add(candidate.referencedName, candidate.modelName);
      kept.add(candidate);
    }
  }

  return candidates.map((candidate) => {
    const { rank: _rank, ...foreignKey } = candidate;
    const keep = kept.has(candidate);
    return {
      ...foreignKey,
      dbOnDelete:
        keep && ACTING.has(foreignKey.onDelete)
          ? foreignKey.onDelete
          : 'noAction',
      dbOnUpdate:
        keep && foreignKey.onUpdate && ACTING.has(foreignKey.onUpdate)
          ? foreignKey.onUpdate
          : 'noAction'
    };
  });
}

/**
 * Lists the foreign keys referencing a model whose action on delete the database leaves to the data layer, i.e. the
 * ones of {@link sqlServerForeignKeys} that cascade or set null without the database doing it.
 *
 * @param {ForeignKey[]} foreignKeys - The foreign keys with their database actions.
 * @param {string} referencedName - The name of the referenced model.
 * @return {ForeignKey[]} The foreign keys whose action on delete the data layer applies.
 */
export function emulatedForeignKeys(
  foreignKeys: ForeignKey[],
  referencedName: string
): ForeignKey[] {
  return foreignKeys.filter(
    (fk) =>
      fk.referencedName === referencedName &&
      fk.dbOnDelete === 'noAction' &&
      (fk.onDelete === 'cascade' || fk.onDelete === 'setNull')
  );
}

/** Lists every foreign key column the schema generator emits, in the order of the models and their fields. */
function foreignKeyCandidates(
  models: Record<string, ResourceModel>
): ForeignKeyCandidate[] {
  const authModel = Object.values(models).find(isResourceAuthModel);
  const candidates: ForeignKeyCandidate[] = [];

  for (const model of Object.values(models)) {
    if (model.config.generateSchema === false) {
      continue;
    }

    for (const [field, relation] of Object.entries(
      model.config.relations ?? {}
    )) {
      const referencedName = capitalize(relation.model);
      if (isRelationOwner(relation)) {
        candidates.push({
          modelName: model.name,
          foreignKey: `${field}Id`,
          referencedName,
          onDelete:
            relation.onDelete ??
            (relation.required === false ? 'setNull' : 'restrict'),
          onUpdate: relation.onUpdate,
          rank: relation.onDelete || relation.onUpdate ? 0 : 1
        });
      } else if (
        relation.type !== 'manyToMany' &&
        !(
          relation.mappedBy &&
          models[referencedName]?.config.relations?.[relation.mappedBy]
        )
      ) {
        // A non-owning side declared alone: the referenced model holds the
        // optional foreign key column
        candidates.push({
          modelName: referencedName,
          foreignKey: `${uncapitalize(model.name)}Id`,
          referencedName: model.name,
          onDelete: 'setNull',
          rank: 1
        });
      }
    }

    for (const [field, file] of Object.entries(model.config.files ?? {})) {
      if (!file.array) {
        candidates.push({
          modelName: model.name,
          foreignKey: `${field}Id`,
          referencedName: 'File',
          onDelete: 'setNull',
          rank: 2
        });
      }
    }

    if (authModel) {
      const audit = { createdById: true, ...model.config.audit };
      const auditKeys = [
        ...(audit.createdById ? ['createdById'] : []),
        ...(hasSoftDelete(model.config) ? ['deletedById'] : [])
      ];
      for (const foreignKey of auditKeys) {
        candidates.push({
          modelName: model.name,
          foreignKey,
          referencedName: authModel.name,
          onDelete: 'setNull',
          rank: 3
        });
      }
    }
  }

  return candidates;
}

/** The edges of the implicit join tables of the `manyToMany` relations and the file lists, which always cascade. */
function joinTableEdges(
  models: Record<string, ResourceModel>
): [string, string][] {
  const edges: [string, string][] = [];
  const seen = new Set<string>();

  for (const model of Object.values(models)) {
    if (model.config.generateSchema === false) {
      continue;
    }

    for (const [field, relation] of Object.entries(
      model.config.relations ?? {}
    )) {
      if (relation.type !== 'manyToMany') {
        continue;
      }
      const referencedName = capitalize(relation.model);
      const mapped =
        relation.mappedBy &&
        models[referencedName]?.config.relations?.[relation.mappedBy]
          ? `${referencedName}.${relation.mappedBy}`
          : undefined;
      const joinTable = [`${model.name}.${field}`, mapped]
        .filter(Boolean)
        .sort()
        .join('|');
      if (!seen.has(joinTable)) {
        seen.add(joinTable);
        edges.push([model.name, joinTable], [referencedName, joinTable]);
      }
    }

    for (const [field, file] of Object.entries(model.config.files ?? {})) {
      if (file.array) {
        const joinTable = `${model.name}.${field}`;
        edges.push([model.name, joinTable], ['File', joinTable]);
      }
    }
  }

  return edges;
}

/** The tables linked by referential actions, from the referenced table to the referencing one. */
class ActionGraph {
  private readonly edges = new Map<string, string[]>();
  private readonly reverse = new Map<string, string[]>();

  public add(from: string, to: string): void {
    this.edges.set(from, [...(this.edges.get(from) ?? []), to]);
    this.reverse.set(to, [...(this.reverse.get(to) ?? []), from]);
  }

  /** Whether an edge forms neither a cycle nor a second path between two tables. */
  public accepts(from: string, to: string): boolean {
    const sources = [from, ...this.reached(from, this.reverse)];
    const targets = [to, ...this.reached(to, this.edges)];
    return sources.every((source) => {
      const reached = this.reached(source, this.edges);
      return targets.every(
        (target) => target !== source && !reached.has(target)
      );
    });
  }

  private reached(start: string, edges: Map<string, string[]>): Set<string> {
    const reached = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      for (const next of edges.get(queue.shift()!) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    return reached;
  }
}
