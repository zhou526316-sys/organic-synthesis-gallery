declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
  }

  interface QRCodeModule {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  }

  const QRCode: QRCodeModule;
  export default QRCode;
}
