import { useEffect, useState } from "react";

/**
 * Debounces a value by delaying updates until after the specified delay
 * @param value - The value to debounce
 * @param delayMs - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debouncedValue;
}
