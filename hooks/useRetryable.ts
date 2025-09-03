import { useCallback, useRef, useState } from "react";

type AsyncFn<T> = () => Promise<T>;

interface UseRetryableOptions<T> {
  fn: AsyncFn<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
  autoRun?: boolean;
}

export function useRetryable<T>({ fn, onSuccess, onError, autoRun = false }: UseRetryableOptions<T>) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [loading, setLoading] = useState<boolean>(autoRun);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err: any) {
      const msg = err?.message || "Request failed";
      setError(msg);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onError, onSuccess]);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    try {
      return await run();
    } finally {
      setIsRetrying(false);
    }
  }, [run]);

  const clearError = useCallback(() => setError(null), []);

  return { run, retry, clearError, loading, isRetrying, error, data } as const;
}

// Convenience: wrap a fetch call with timeout and standard error handling
export interface RetryableFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export function useRetryableFetch<T>(url: string, options: RetryableFetchOptions = {}) {
  const { timeoutMs = 20_000, ...init } = options;

  return useRetryable<T>({
    fn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
        }
        return json as T;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw new Error("Request aborted due to timeout");
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

