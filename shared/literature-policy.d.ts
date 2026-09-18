export const EXCLUDED_DOIS: ReadonlySet<string>;
export function normalizePolicyDoi(value: unknown): string;
export function isExcludedDoi(value: unknown): boolean;
export function validAddedDate(value: unknown): string;
export function earliestAddedDate(...values: unknown[]): string;
export function beijingDate(date?: Date): string;
