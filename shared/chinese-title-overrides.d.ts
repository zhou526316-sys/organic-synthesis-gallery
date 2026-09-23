// Type-only companion to chinese-title-overrides.js. No translation data or
// runtime behavior is changed; keep strict frontend checking enabled.
export interface ChineseTitleInput {
  doi?: string | null;
  title?: string | null;
  titleZh?: string | null;
}
export const CURRENT_TITLE_TRANSLATIONS: ReadonlyArray<Readonly<{
  doi: string;
  title: string;
  zh: string;
}>>;
export function titleKey(value: unknown): string;
export function validChineseTitle(value: unknown): value is string;
export function chineseTitle(paper: ChineseTitleInput | null | undefined, cache?: ReadonlyMap<string, string>): string;
