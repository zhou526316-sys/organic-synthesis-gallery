export interface TargetJournal {
  readonly name: string;
  readonly issns: readonly string[];
  readonly activeFrom: string;
}

export const TARGET_JOURNALS: readonly TargetJournal[];
export function effectiveJournalStart(journal: TargetJournal | undefined | null, requestedStart: string): string;
export function journalsActiveOn(date: string): TargetJournal[];
