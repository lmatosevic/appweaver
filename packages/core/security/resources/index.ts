import { Type } from '@sinclair/typebox';
import identity from './identity/model';
import permission from './permission/model';
import role from './role/model';

const securityResources = Type.Module({
  Identity: identity.readModel,
  Permission: permission.readModel,
  Role: role.readModel
});

export default securityResources;
