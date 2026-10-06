export interface PublishedHotFallbackResult {
  mode: 'architecture-hot-fallback';
  asOfDate: string;
  publicationSlot: string;
  sourceCommit: string;
  catalogId: string;
  papers: unknown[];
}

export function loadPublishedHotFallback(
  siteBase: string | URL,
  options?: PublishedCatalogClientOptions & { signal?: AbortSignal },
): Promise<PublishedHotFallbackResult>;

export interface PublishedCatalogClientOptions {
  fetcher?: typeof fetch;
}

export class PublishedCatalogClient {
  constructor(siteBase: string | URL, options?: PublishedCatalogClientOptions);
  readonly siteBase: URL;
  readonly architectureBase: URL;
  asOfDate: string;
  catalogId: string;
  memberDois: string[];
  earliestDate: string;
  open(signal?: AbortSignal): Promise<this>;
  landing(sharedDoi?: string | null, signal?: AbortSignal): Promise<unknown[]>;
  resolve(dois: string[], signal?: AbortSignal): Promise<unknown[]>;
  resolveIndexed(items: Array<{ doi: string; revision: string }>, signal?: AbortSignal): Promise<unknown[]>;
  search(query: string, signal?: AbortSignal): Promise<unknown[]>;
  range(fromDate?: string, toDate?: string, signal?: AbortSignal): Promise<unknown[]>;
}
