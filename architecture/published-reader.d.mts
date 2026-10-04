export interface PublishedCatalogClientOptions {
  fetcher?: typeof fetch;
}

export class PublishedCatalogClient {
  constructor(siteBase: string | URL, options?: PublishedCatalogClientOptions);
  readonly siteBase: URL;
  readonly architectureBase: URL;
  asOfDate: string;
  memberDois: string[];
  earliestDate: string;
  open(signal?: AbortSignal): Promise<this>;
  landing(sharedDoi?: string | null, signal?: AbortSignal): Promise<unknown[]>;
  resolve(dois: string[], signal?: AbortSignal): Promise<unknown[]>;
  search(query: string, signal?: AbortSignal): Promise<unknown[]>;
  range(fromDate?: string, toDate?: string, signal?: AbortSignal): Promise<unknown[]>;
}
