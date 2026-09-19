export type PublisherKey = 'acs' | 'wiley' | 'springer_nature' | 'aaas' | 'rsc' | 'elsevier' | 'ccs' | 'other';
export const PUBLISHERS: readonly Exclude<PublisherKey, 'other'>[];
export const PUBLISHER_LABELS: Record<PublisherKey, string>;
export const TARGET_JOURNALS_BY_PUBLISHER: Record<Exclude<PublisherKey, 'other'>, readonly string[]>;
export function publisherForDoi(value: unknown): PublisherKey;
export function articleUrlForPublisherDoi(value: unknown): string;
