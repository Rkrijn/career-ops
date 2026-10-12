// Carry only the list's own filters through a report URL. Return destinations
// remain fixed to /pipeline; no arbitrary "returnTo" URL or browser storage.
const FILTER_KEYS = ["tab", "min", "sort", "dir", "q"];

/**
 * @param {string | Record<string, string | string[] | undefined>} params
 * @param {string} [search] The current local search, including an explicit clear.
 */
export function pipelineQuery(params, search) {
  const query = new URLSearchParams();
  const source = typeof params === "string" ? new URLSearchParams(params) : params;
  for (const key of FILTER_KEYS) {
    const raw = source instanceof URLSearchParams ? source.get(key) : source[key];
    // Match useSearchParams().get(): a repeated query key uses its first value.
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  if (search !== undefined) {
    if (search) query.set("q", search);
    else query.delete("q");
  }
  return query.toString();
}
