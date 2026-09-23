/** Head styles/scripts do not add or remove literature-card content. Scanning
 * every card on those mutations also lets screenshot/style tooling repeatedly
 * interrupt image painting. Body content, root language and mixed batches keep
 * the existing recovery path; explicit asset-update signals are unaffected. */
export function shouldScanDisplay(
  records: readonly Pick<MutationRecord, 'target'>[],
  head: Pick<Node, 'contains'> | null = document.head,
): boolean {
  return records.some(record => !head || !head.contains(record.target));
}
