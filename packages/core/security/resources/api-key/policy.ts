import { createPolicy } from '../../../factory';
import { currentAuthUser } from '../../helper';

export default createPolicy({
  modelName: 'ApiKey',
  checkAccess: (_, resource) => {
    return resource.authId === currentAuthUser()!.id;
  },
  readRestrictions: () => {
    return { authId: currentAuthUser()!.id };
  },
  writeRestrictions: () => {
    return { authId: currentAuthUser()!.id };
  }
});
