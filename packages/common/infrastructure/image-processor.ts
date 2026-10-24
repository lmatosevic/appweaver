import { Readable } from 'node:stream';
import { ImageConfig } from '../types';

/**
 * Transforms the uploaded images, i.e. resizing and compressing them by the image config of their file field. Without
 * an image processor the images are stored as they are uploaded.
 */
export abstract class ImageProcessor {
  /**
   * Checks if the processor transforms the images of a MIME type.
   *
   * @param {string} mimeType - The MIME type of the image, i.e. `image/png`.
   * @return {boolean} `true` if the images of the type are transformed.
   */
  abstract supports(mimeType: string): boolean;

  /**
   * Transforms an image, applying its EXIF orientation and the image config of its file field.
   *
   * @param {Readable} stream - The stream of the uploaded image.
   * @param {string} mimeType - The MIME type of the image.
   * @param {ImageConfig} [config] - The image config of the file field: dimensions, fit and quality.
   * @return {Readable} The stream of the transformed image, in the same format.
   */
  abstract process(
    stream: Readable,
    mimeType: string,
    config?: ImageConfig
  ): Readable;
}
