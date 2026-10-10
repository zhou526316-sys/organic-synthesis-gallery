export interface HistoricalPaperMeta {
  date?: string | null;
  firstOnlineDate?: string | null;
  addedDate?: string | null;
  ingestionChannel?: 'historical_backfill' | 'normal' | null;
  mediaPolicy?: 'metadata_only' | 'toc_only' | 'standard' | null;
  paper?: HistoricalPaperMeta | null;
}
export function isHistoricalBackfill(paper: HistoricalPaperMeta | null | undefined): boolean;
export function isJulSepPaper(paper: HistoricalPaperMeta | null | undefined): boolean;
export function isJulSepTocOnly(paper: HistoricalPaperMeta | null | undefined): boolean;
export function paperMediaPolicy(paper: HistoricalPaperMeta | null | undefined): 'metadata_only' | 'toc_only' | 'standard';
export function isRetrospectiveAdmission(paper: HistoricalPaperMeta | null | undefined): boolean;
export function shouldShowDailyNew(paper: HistoricalPaperMeta | null | undefined, asOfDay: string): boolean;
export function isOctoberFullCapturePaper(paper: HistoricalPaperMeta | null | undefined): boolean;
