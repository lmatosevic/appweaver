import { defineModule, ImageProcessor } from '@appweaver/common';

/** The sharp image processor, transforming the uploaded images. */
export default defineModule({
  name: '@appweaver/sharp',
  loggerNames: ['storage'],
  providers: [
    {
      contract: ImageProcessor,
      name: 'sharp',
      load: () => import('./sharp-image-processor')
    }
  ]
});
