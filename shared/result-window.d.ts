export declare const RESULT_WINDOW_SIZE: number;
export declare const MOBILE_RESULT_WINDOW_SIZE: number;
export declare function resultWindowState(
  total: number,
  page?: number,
  size?: number,
): {
  page: number;
  pages: number;
  start: number;
  end: number;
  returned: number;
  hasPrevious: boolean;
  hasNext: boolean;
};
