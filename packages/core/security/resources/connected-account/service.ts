import { createService } from '../../../factory';
import { isOAuth2Enabled } from '../../helper';

export default isOAuth2Enabled()
  ? createService({ modelName: 'ConnectedAccount' })
  : undefined;
