import {
  ActionType,
  extractSchemaProperties,
  FileField,
  isArray,
  isObject,
  isPlainObject,
  OutputType,
  pickProperties,
  RelationField
} from '@appweaver/common';
import { injectModel } from '../../context';
import { currentAuthUser } from '../../security';
import { HttpError } from '../../errors';

/** The nested write actions a single relation field can be mapped to. */
export type RelationActions = Record<
  string,
  Partial<{
    connect: any;
    create: any;
    update: any;
    connectOrCreate: any;
    disconnect: any;
    delete: any;
  }>
>;

/**
 * Builds the Prisma `include` clause for the relation and file fields of a resource model. A field is included when
 * its configured output type allows it for the given action, or always when no action is specified, and the relations
 * configured with an output count contribute to the `_count` selection instead.
 *
 * @param {string} resourceName - The name of the model whose relations are included.
 * @param {ActionType} [action] - The action the inclusions are built for, matched against the configured output type
 * of every field. When omitted, all fields whose output type is not `none` are included.
 * @return {Object} The `include` clause mapping each included field to `true` or to its own nested `include` clause,
 * extended with a `_count` selection for the relations configured with an output count.
 */
export function mapRelationInclusions(
  resourceName: string,
  action?: ActionType
): Record<string, any> {
  const inclusion: Record<string, any> = {};

  const resourceModel = injectModel(resourceName);
  const relationConfig = resourceModel.config.relations;
  const fileConfig = resourceModel.config.files;

  const relationModelProps = extractSchemaProperties(
    resourceModel.relationsModel
  );
  const fileModelProps = extractSchemaProperties(resourceModel.filesModel);

  // Add relation and file fields to the inclusion map if the include type is
  // satisfied or the requested action is not specified. Also, add the count
  // aggregation actions for relations if configured.
  for (const key of Object.keys({
    ...relationModelProps,
    ...fileModelProps
  })) {
    const relationField: RelationField | FileField | undefined =
      relationConfig?.[key] || fileConfig?.[key];

    if (relationField?.output?.count) {
      inclusion._count = inclusion._count ?? { select: {} };
      inclusion._count.select[key] = true;
    }

    // Check if the relation should be included based on the output type
    if (shouldIncludeRelation(relationField?.output?.type, action)) {
      inclusion[key] = buildNestedInclusion(
        relationField as RelationField,
        action
      );
    }
  }

  return inclusion;
}

/**
 * Maps the relation and file fields of a write payload to the Prisma nested write actions. Bare key values and arrays
 * of them are normalized to objects first, then every item is classified: items with an id and additional data become
 * inline updates when the parent action is an update and inline updates are enabled for the relation, items with only
 * an id are connected, and items without an id are created inline or matched through a connect-or-create when
 * `input.uniqueKey` is configured. On an update action, the items of the current record that are absent from the new
 * value, as well as the relations set to null, are disconnected, or deleted when `orphanRemoval` is configured.
 * Relations that were not loaded on the current record are left untouched.
 *
 * @param {string} resourceName - The name of the model the write payload belongs to.
 * @param {'create'|'update'} action - The write action the relation actions are mapped for. Inline updates and the
 * removal of the relations absent from the new value are only applied on an update action.
 * @param {Object} data - The sanitized write payload whose relation and file fields are mapped. The non-relation
 * fields are skipped, except for the null values of the array scalar fields, which are mapped to an empty array on an
 * update action and to undefined on a create action.
 * @param {Object} [currentData] - The currently stored record with its relations loaded, required on an update action
 * to determine which relations to disconnect or delete.
 * @return {RelationActions} The nested write clause per relation field, mapping each one to its `connect`, `create`,
 * `update`, `connectOrCreate`, `disconnect` and `delete` actions, or to undefined for the relations no action can be
 * applied to.
 * @throws {HttpError} 400 if an inline create payload is missing required fields, or if the relation accepts no new
 * records and an id was not provided.
 */
export function mapRelationActions(
  resourceName: string,
  action: 'create' | 'update',
  data: any,
  currentData?: any
): RelationActions {
  const relations = {};

  const resourceModel = injectModel(resourceName);
  const readModel = resourceModel.readModel;
  const relationsModel = resourceModel.relationsModel;
  const relationsConfig = resourceModel.config.relations;

  for (const key in data) {
    let value = data[key];

    const relationSchema = extractSchemaProperties(relationsModel, key);
    if (!relationSchema) {
      // Set empty array or undefined value for null array type fields
      if (value === null) {
        if (extractSchemaProperties(readModel, key)?.type === 'array') {
          relations[key] = action === 'update' ? [] : undefined;
        } else if (action === 'create') {
          relations[key] = undefined;
        }
      }

      // Skip mapping for non-relation fields
      continue;
    }

    const config: RelationField | undefined = relationsConfig?.[key];
    // The unique key is only used to match existing records for the
    // connect-or-create action; connect and inline update always use the id
    const uniqueKey = config?.input?.allowCreate
      ? config?.input?.uniqueKey || 'id'
      : 'id';
    const isArrayType = relationSchema.type === 'array';

    // Normalize array values to single values if a value type is not an array
    if (!isArrayType && isArray(value)) {
      value = value[0];
    }

    // Set null values to undefined value for create actions. On update action
    // they will be returned as disconnected relations.
    if (action === 'create' && value === null) {
      relations[key] = undefined;
      continue;
    }

    // Normalize plain key values or arrays to object values
    if (isArrayType) {
      if (isArray(value) && !isPlainObject(value[0])) {
        value = value.map((v: any) => ({
          [uniqueKey]: v
        }));
      }
    } else if (!isObject(value)) {
      // Only bare key values are wrapped. The loose object check keeps
      // null values untouched, so they still map to a disconnect action.
      value = { [uniqueKey]: value };
    }

    // Classify every relation input item into its relation write action:
    // items with an id and additional data become inline updates (on parent
    // update requests with inline updates enabled), items with only an id are
    // connected, and items without an id are created inline or matched with
    // connect-or-create, both of which require `allowCreate`
    if (value) {
      const items: any[] = isArrayType && isArray(value) ? value : [value];
      const createdBy = createdByConnect(config?.model ?? resourceName);

      const actions: Record<string, any[]> = {
        connect: [],
        update: [],
        create: [],
        connectOrCreate: []
      };

      for (const item of items) {
        if (!isPlainObject(item)) {
          continue;
        }

        if (item.id !== undefined && item.id !== null) {
          const { id, ...itemData } = item;
          const updateData = relationWriteData(
            config?.model,
            'update',
            itemData
          );
          if (
            action === 'update' &&
            config?.input?.allowUpdate &&
            Object.keys(updateData).length > 0
          ) {
            actions.update.push({ where: { id }, data: updateData });
          } else {
            actions.connect.push({ id });
          }
        } else if (!config?.input?.allowCreate) {
          // Without inline creation the related record must already exist,
          // so it is created through its own endpoint first
          throw new HttpError(
            `${resourceName} relation '${key}' does not accept new records, an id is required`,
            400
          );
        } else {
          const createData = relationWriteData(config?.model, 'create', item);
          const missingFields = missingRelationFields(
            config?.model,
            createData
          );
          if (missingFields.length > 0) {
            throw new HttpError(
              `${resourceName} relation '${key}' is missing required fields: ${missingFields.join(', ')}`,
              400
            );
          }

          // A unique key matches an existing record before a new one is created
          if (config?.input?.uniqueKey) {
            actions.connectOrCreate.push({
              where: { [uniqueKey]: item[uniqueKey] },
              create: { ...createData, createdBy }
            });
          } else {
            actions.create.push({ ...createData, createdBy });
          }
        }
      }

      const relationActions = {};
      for (const [actionName, actionItems] of Object.entries(actions)) {
        if (actionItems.length > 0) {
          relationActions[actionName] = isArrayType
            ? actionItems
            : actionItems[0];
        }
      }

      if (Object.keys(relationActions).length > 0) {
        relations[key] = relationActions;
      }
    }

    // Map relation disconnects if keys are no longer present or the new
    // value is null. Delete relations if orphanRemoval is set to true.
    // Relations that are not set on the current resource are left untouched,
    // so no relation action is applied for them.
    if (action === 'update') {
      const currentValue = currentData[key];
      const removalMethod = config?.orphanRemoval ? 'delete' : 'disconnect';
      if (currentValue && isArrayType) {
        const newValueKeys = value?.map((v: any) => v[uniqueKey]) ?? [];
        const currentValueKeys = currentValue
          .filter((v: any) => newValueKeys.indexOf(v[uniqueKey]) === -1)
          .map((v: any) => ({
            [uniqueKey]: v[uniqueKey]
          }));
        if (currentValueKeys.length > 0) {
          relations[key] = {
            [removalMethod]: currentValueKeys,
            ...(relations[key] ?? {})
          };
        }
      } else if (currentValue && value === null) {
        relations[key] = {
          [removalMethod]: { [uniqueKey]: currentValue[uniqueKey] },
          ...(relations[key] ?? {})
        };
      } else if (currentValue === undefined) {
        // The relation was not loaded on the current record, so no relation
        // action can be applied safely
        relations[key] = undefined;
      }
    }
  }

  return relations;
}

/**
 * Restricts an inline relation payload to the fields the related model accepts for the given action. The request
 * schema accepts the create and the update fields together, since the properties it does not declare are stripped
 * before the request reaches the service, so the configured field restrictions of the related model are applied here
 * instead.
 *
 * @param {string} [resourceName] - The name of the related model whose field restrictions are applied. When omitted,
 * the payload is returned unchanged.
 * @param {'create'|'update'} action - The write action the payload is restricted for, selecting either the relation
 * create or the relation update model of the related resource.
 * @param {Object} data - The inline relation payload to restrict.
 * @return {Object} The payload reduced to the fields the related model accepts for the action, excluding the `id`
 * field, or the payload unchanged if the related model declares no fields for it.
 */
export function relationWriteData(
  resourceName: string | undefined,
  action: 'create' | 'update',
  data: any
): any {
  const resourceModel = resourceName
    ? injectModel(resourceName, false)
    : undefined;

  const writeModel =
    action === 'create'
      ? resourceModel?.relationCreateModel
      : resourceModel?.relationUpdateModel;

  const properties = extractSchemaProperties(writeModel);
  if (!properties) {
    return data;
  }

  return pickProperties(
    data,
    Object.keys(properties).filter((name) => name !== 'id')
  );
}

/**
 * Lists the fields the related model requires on creation that the given inline relation payload does not provide.
 *
 * @param {string} [resourceName] - The name of the related model whose required fields are checked. When omitted, no
 * fields are reported as missing.
 * @param {Object} data - The inline relation payload to check.
 * @return {string[]} The names of the fields the related model requires on creation that the payload leaves
 * undefined, or an empty list if the related model declares no create schema.
 */
export function missingRelationFields(
  resourceName: string | undefined,
  data: any
): string[] {
  const resourceModel = resourceName
    ? injectModel(resourceName, false)
    : undefined;

  const createModel = resourceModel?.relationCreateModel;
  if (!createModel) {
    return [];
  }

  const schema = createModel['$ref']
    ? createModel['$defs']?.[createModel['$ref']]
    : createModel;

  return (schema?.required ?? []).filter(
    (name: string) => data[name] === undefined
  );
}

/**
 * Builds the connect action for the `createdBy` audit relation of a resource, pointing at the currently authenticated
 * user. Returns undefined when the model does not audit the `createdById` field or when no user is authenticated.
 *
 * @param {string} resourceName - The name of the model the audit relation is built for.
 * @return {{connect: {id: number}}|undefined} The connect action pointing at the id of the currently authenticated
 * user, or undefined if the model does not audit the `createdById` field or no user is authenticated.
 */
export function createdByConnect(
  resourceName: string
): { connect: { id: number } } | undefined {
  const resourceModel = injectModel(resourceName, false);
  if (resourceModel?.config.audit?.createdById === false) {
    return undefined;
  }

  const currentUser = currentAuthUser();
  return currentUser
    ? {
        connect: {
          id: currentUser.id
        }
      }
    : undefined;
}

/**
 * Resolves the inclusion value of a single relation field by walking its configured nested output includes
 * recursively. Returns `true` when the relation has no nested includes to apply for the given action, or a nested
 * `include` clause otherwise.
 *
 * @param {RelationField} relationField - The configuration of the relation whose inclusion value is resolved, read
 * from its `output.include` property.
 * @param {ActionType} [action] - The action the inclusions are built for, matched against the configured output type
 * of every nested relation.
 * @return {boolean|Object} True if the relation has no nested relations to include for the given action, or the
 * nested `include` clause otherwise.
 */
function buildNestedInclusion(
  relationField: RelationField,
  action?: ActionType
): boolean | { include: Record<string, any> } {
  const nestedIncludeConfig = relationField?.output?.include;

  if (!nestedIncludeConfig || Object.keys(nestedIncludeConfig).length === 0) {
    return true;
  }

  const nestedInclusion: Record<string, any> = {};

  for (const [nestedKey, nestedOutput] of Object.entries(nestedIncludeConfig)) {
    // Check if the nested relation should be included
    if (shouldIncludeRelation(nestedOutput?.type, action)) {
      // Recursively build nested inclusions
      nestedInclusion[nestedKey] = buildNestedInclusion(
        { output: nestedOutput } as RelationField,
        action
      );
    }
  }

  return Object.keys(nestedInclusion).length > 0
    ? { include: nestedInclusion }
    : true;
}

/**
 * Decides whether a relation with the given configured output type is included for the given action. The `none` type
 * is never included, the `single` type is excluded from the query action, and the `multiple` type is only included on
 * the query action or when no action is specified.
 *
 * @param {OutputType} [outputType] - The configured output type of the relation. When omitted, the relation is
 * included for every action.
 * @param {ActionType} [action] - The action the relation would be included for. When omitted, every output type
 * except `none` is included.
 * @return {boolean} True if the relation should be included, false otherwise.
 */
function shouldIncludeRelation(
  outputType?: OutputType,
  action?: ActionType
): boolean {
  if (outputType === 'none') {
    return false;
  }
  if (outputType === 'single' && action === 'query') {
    return false;
  }
  return !(outputType === 'multiple' && action && action !== 'query');
}
