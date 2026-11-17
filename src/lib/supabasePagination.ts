export interface SupabasePageResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

export const fetchAllSupabasePages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
  pageSize = 1000
): Promise<SupabasePageResult<T>> => {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('Supabase pagination page size must be a positive integer.');
  }

  const allRows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const page = data || [];
    allRows.push(...page);
    if (page.length < pageSize) return { data: allRows, error: null };
  }
};
