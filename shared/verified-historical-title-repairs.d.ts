export function verifiedHistoricalTitle(doi: string | null | undefined): string | null;
export function verifiedHistoricalTitleSources(doi: string | null | undefined): Readonly<{title: string;publisherUrl: string}> | null;
export function verifiedTocQueueTitle(doi: string | null | undefined, rawTitle: unknown): string;
