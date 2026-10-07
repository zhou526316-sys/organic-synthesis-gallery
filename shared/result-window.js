export const RESULT_WINDOW_SIZE = 24;
export const MOBILE_RESULT_WINDOW_SIZE = 12;

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


export function resultPaginationItems(page, pages, compact = false) {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('invalid_result_page');
  if (!Number.isSafeInteger(pages) || pages < 1) throw new Error('invalid_result_pages');
  const current = Math.min(page, pages);
  const siblingCount = compact ? 1 : 2;
  const visibleWithoutEllipses = siblingCount * 2 + 5;
  if (pages <= visibleWithoutEllipses) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, pages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < pages - 1;
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftCount = 3 + siblingCount;
    return [...range(1, leftCount), 'ellipsis', pages];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + siblingCount;
    return [1, 'ellipsis', ...range(pages - rightCount + 1, pages)];
  }
  return [1, 'ellipsis', ...range(leftSibling, rightSibling), 'ellipsis', pages];
}
