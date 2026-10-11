export const PDF_SESSION_RECEIPT_KEY: string;
export const PDF_SESSION_RECEIPT_TTL_MS: number;
export function clearPdfSessionReceipt(): void;
export function recordVerifiedPdfSession(token: string, userId: string,
  options?: { currentToken?: () => string }): Promise<boolean>;
export function readVerifiedPdfSession(token: string,
  options?: { now?: number }): Promise<{ id: string; verifiedAt: number } | null>;
