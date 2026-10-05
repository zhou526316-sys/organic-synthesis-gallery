export const RESULT_WINDOW_SIZE = 60;

export function resultWindowState(total, page = 1, size = RESULT_WINDOW_SIZE) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('invalid_result_total');
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('invalid_result_page');
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('invalid_result_window_size');
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(page, pages);
  const start = total === 0 ? 0 : (currentPage - 1) * size;
  const end = Math.min(total, start + size);
  return {
    page: currentPage,
    pages,
    start,
    end,
    returned: Math.max(0, end - start),
    hasPrevious: currentPage > 1,
    hasNext: end < total,
  };
}
