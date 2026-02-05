export type ResourceService = {
  name?: string;
  beforeFind?: (id: any) => any;
  beforeQuery?: (filter: any) => any;
  beforeAggregate?: (filter: any) => any;
  beforeCreate?: (data: any) => any;
  beforeUpdate?: (id: any, data: any) => any;
  beforeDelete?: (id: any) => any;
  afterFind?: (resource: any) => any;
  afterQuery?: (response: any) => any;
  afterAggregate?: (response: any) => any;
  afterCreate?: (resource: any) => any;
  afterUpdate?: (resource: any) => any;
  afterDelete?: (resource: any) => any;
  textSearch?: (input: string) => any;
};
