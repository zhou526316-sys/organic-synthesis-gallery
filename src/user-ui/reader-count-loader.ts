// Read-side coordination only. The server remains authoritative for IP deduplication
// and reader totals. Successful mark responses bypass this short read cache.
export class ReaderCountLoader {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly freshUntil = new Map<string, number>();
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly fetchCounts: (dois: string[]) => Promise<unknown>,
    private readonly publish: (counts: Record<string, number>) => void,
    private readonly now: () => number = Date.now,
    private readonly maxAgeMs = 30_000,
  ) {}

  /** Prevent a read begun before a successful mark from overwriting its count. */
  noteMark(doi: string): void {
    this.versions.set(doi, (this.versions.get(doi) || 0) + 1);
    this.freshUntil.set(doi, this.now() + this.maxAgeMs);
  }

  async load(dois: string[]): Promise<void> {
    const waiting = new Set<Promise<void>>();
    const needed: string[] = [];
    for (const doi of new Set(dois)) {
      const existing = this.pending.get(doi);
      if (existing) waiting.add(existing);
      else if ((this.freshUntil.get(doi) || 0) <= this.now()) needed.push(doi);
    }
    for (let index = 0; index < needed.length; index += 150) {
      const chunk = needed.slice(index, index + 150);
      const versions = chunk.map(doi => this.versions.get(doi) || 0);
      // Queue the network call after reservations are installed, including when
      // another caller requests an overlapping DOI set in the same event turn.
      const job: Promise<void> = Promise.resolve().then(() => this.fetchCounts(chunk)).then(payload => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
        const counts = payload as Record<string, unknown>;
        const accepted: Record<string, number> = {};
        chunk.forEach((doi, offset) => {
          if ((this.versions.get(doi) || 0) !== versions[offset]) return;
          // A valid sparse counts map omits zero-count DOIs in the existing API.
          // A missing/invalid map or an invalid explicit value is not a fake zero.
          const value = Object.prototype.hasOwnProperty.call(counts, doi) ? counts[doi] : 0;
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return;
          accepted[doi] = value;
          this.freshUntil.set(doi, this.now() + this.maxAgeMs);
        });
        if (Object.keys(accepted).length) this.publish(accepted);
      }).catch(() => {
        // No freshness mark on failure: later requests can retry, and the last
        // successful numbers remain visible instead of being replaced with zero.
      }).finally(() => {
        chunk.forEach(doi => { if (this.pending.get(doi) === job) this.pending.delete(doi); });
      });
      chunk.forEach(doi => this.pending.set(doi, job));
      waiting.add(job);
    }
    await Promise.all(waiting);
  }
}
