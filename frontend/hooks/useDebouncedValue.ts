import { useEffect, useState } from "react";

/**
 * Returns a value that updates after `delay` ms of stability.
 * Useful for server-backed search on paginated lists.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
