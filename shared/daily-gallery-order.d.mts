export interface DailyGalleryCardRecord {
  doi?: string | null;
  journal?: string | null;
  addedDate?: string | null;
  date?: string | null;
  firstOnlineDate?: string | null;
  paper?: { journal?: string | null } | null;
}

export declare const DAILY_GALLERY_JOURNAL_ORDER: readonly string[];
export declare function dailyGalleryJournalPriority(journal: string | null | undefined): number;
export declare function compareDailyGalleryCards(a: DailyGalleryCardRecord, b: DailyGalleryCardRecord): number;
