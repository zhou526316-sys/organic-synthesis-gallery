export declare function correctedPublisherDateForDisplay<T extends {
  doi?: string | null;
  journal?: string | null;
  addedDate?: string;
  date?: string;
  dateUnverified?: boolean;
}>(paper: T): T;

export declare function publicationDateForDisplay(
  date: string | null | undefined,
  asOfBeijingDay: string,
  unverified?: boolean
): {
  date: string;
  unverified: boolean;
  reason: 'missing_or_invalid' | 'future_unverified' | 'unverified' | 'confirmed';
};
