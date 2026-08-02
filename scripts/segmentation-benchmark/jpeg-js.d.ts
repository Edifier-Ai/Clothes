declare module 'jpeg-js' {
  export interface DecodedJpeg {
    width: number;
    height: number;
    /** RGBA 像素（length = width*height*4）。 */
    data: Uint8Array;
  }
  export function decode(
    jpegData: Uint8Array | Buffer,
    opts?: { maxMemoryUsageInMB?: number; colorTransform?: boolean },
  ): DecodedJpeg;
}
