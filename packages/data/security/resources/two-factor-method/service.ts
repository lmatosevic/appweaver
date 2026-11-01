import { createService } from '../../../factory/create-service';
import { isTwoFactorEnabled } from '../../helper';

export default isTwoFactorEnabled()
  ? createService({ modelName: 'TwoFactorMethod' })
  : undefined;
