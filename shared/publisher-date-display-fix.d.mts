export declare function correctedPublisherDateForDisplay<T extends {
  doi?: string | null;
  journal?: string | null;
  addedDate?: string;
  date?: string;
  dateUnverified?: boolean;
}>(paper: T): T;
