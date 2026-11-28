export const CONFIG_NAME = 'appweaver';

// Registered globally, so a second copy of this package, i.e. of a linked module package, shares them
export const RESOURCE_NAME = Symbol.for('appweaver.ResourceName');
export const RESOURCE_TYPE = Symbol.for('appweaver.ResourceType');
export const RESOURCE_AUTH = Symbol.for('appweaver.ResourceAuth');
export const RESOURCE_MODEL_RELINK = Symbol.for(
  'appweaver.ResourceModelRelink'
);
/** Merges an extension into the config of a model and builds it again, set by `createModel`. */
export const RESOURCE_MODEL_EXTEND = Symbol.for(
  'appweaver.ResourceModelExtend'
);
/** The file a resource was created in, named by the error of a duplicate. */
export const RESOURCE_SOURCE = Symbol.for('appweaver.ResourceSource');

export const RESOURCE_MODEL_TYPE = 'Model';
export const RESOURCE_SERVICE_TYPE = 'Service';
export const RESOURCE_ROUTES_TYPE = 'Routes';
export const RESOURCE_POLICY_TYPE = 'Policy';

export const MODEL = Symbol.for('appweaver.Model');
export const ROUTE = Symbol.for('appweaver.Route');
export const PLUGIN = Symbol.for('appweaver.Plugin');
export const CONFIG = Symbol.for('appweaver.Config');

export const HEALTH_CHECK = Symbol.for('appweaver.HealthCheck');

export const LIFECYCLE = Symbol.for('appweaver.Lifecycle');
