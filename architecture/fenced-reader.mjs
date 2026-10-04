import { CatalogReader } from './reader.mjs';
import { normalizeDoi } from '../shared/literature-identity.mjs';

/** New-reader security/consistency adapter. No production UI imports this yet. */
export class FencedCatalogReader {
  constructor(baseUrl, { fence, ...options }) {
    if (!fence) throw new Error('membership_fence_required');
    this.fence = fence; this.reader = new CatalogReader(baseUrl, options);
  }
  unavailable(doi) { return { status: 'verification-unavailable', ...(doi ? { doi } : {}), complete: false, retryable: true }; }
  async get(doiValue, asOfDate, signal) {
    const doi = normalizeDoi(doiValue);
    if (!doi) throw new Error('invalid_doi');
    if (this.fence.status(doi) === 'withdrawn') return { status: 'withdrawn', doi };
    if (!await this.fence.ready()) return this.unavailable(doi);
    const status = this.fence.status(doi);
    if (status !== 'present') return { status: status === 'unknown' ? 'verification-unavailable' : status, doi };
    const result = await this.reader.get(doi, asOfDate, signal);
    // Re-check after every asynchronous lookup. Revocation may arrive while a shard is loading.
    if (!await this.fence.ready()) return this.fence.status(doi) === 'withdrawn' ? { status: 'withdrawn', doi } : this.unavailable(doi);
    const current = this.fence.status(doi, result.record?.revision);
    if (current !== 'present') return { status: current, doi };
    if (result.status !== 'published') return { status: 'catalog-update-required', doi, complete: false };
    return { ...result, membershipSerial: this.fence.serial, membershipDigest: this.fence.snapshot.digest };
  }
  compatible(catalog) {
    return this.fence.fresh() && catalog.recordCount === this.fence.snapshot.count
      && catalog.recordSetHash === this.fence.snapshot.catalogId;
  }
  async hot(asOfDate, signal) {
    if (!await this.fence.ready()) return { ...this.unavailable(), records: [] };
    const rows = await this.reader.hot(asOfDate, signal);
    if (!await this.fence.ready()) return { ...this.unavailable(), records: [] };
    const records = rows.filter(row => this.fence.status(row.doi, row.revision) === 'present');
    const complete = this.compatible(this.reader.catalog);
    return { status: 'ready', records, complete, catalogUpdateRequired: !complete, membershipDigest: this.fence.snapshot.digest };
  }
  async search(query, options) {
    if (!await this.fence.ready()) return { ...this.unavailable(), results: [], matched: null };
    // Never present a pre-fence count as the current global match count.
    const result = await this.reader.search(query, options);
    if (!await this.fence.ready()) return { ...this.unavailable(), results: [], matched: null };
    const results = result.results.filter(row => this.fence.status(row.doi, row.revision) === 'present');
    const compatible = this.compatible(this.reader.catalog), complete = result.complete && compatible;
    return { ...result, results, matched: complete ? result.matched : null, complete,
      catalogUpdateRequired: !compatible, membershipDigest: this.fence.snapshot.digest };
  }
}
