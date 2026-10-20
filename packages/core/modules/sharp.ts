import { defineModule, ImageProcessor } from '@appweaver/common';

/** The sharp image processor, transforming the uploaded images. */
export default defineModule({
  name: '@appweaver/sharp',
  providers: [
    {
      contract: ImageProcessor,
      name: 'sharp',
      load: () => import('../storage/sharp-image-processor')
    }
  ]
});
