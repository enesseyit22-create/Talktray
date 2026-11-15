/** Supabase returns at most 1000 rows per request by default. */
export const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

type Page<T> = { data: T[] | null; error: unknown };

/**
 * Reads every page of a query, so an account with more than 1000 items or recordings
 * still sees all of them. Stops at the first short page, an error, or 20,000 rows.
 * The first error is returned with whatever was read before it.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize = PAGE_SIZE,
): Promise<Page<T>> {
  const rows: T[] = [];
  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: index === 0 ? null : rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: rows, error: null };
}
