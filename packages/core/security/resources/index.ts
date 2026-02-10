import { Type } from '@sinclair/typebox';
import identity from './identity/model';
import permission from './permission/model';
import role from './role/model';

const securityResources = Type.Module({
  Identity: identity.readOneModel,
  Permission: permission.readOneModel,
  Role: role.readOneModel
});

export default securityResources;
