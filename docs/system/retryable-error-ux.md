Retryable Error UX

Overview
- Use a consistent, friendly error UI with a Retry button for all fetch/database failures.
- Prefer the shared `NetworkError` component and optional `useRetryable` hook.

Key Pieces
- Component: `components/ui/network-error.tsx`
  - Props: `error`, `onRetry?`, `isRetrying?`, `onClear?`, `showIcon?`
  - Classifies likely network vs generic errors; shows a clear message and “Try Again”.

- Hook: `hooks/useRetryable.ts`
  - Returns: `{ run, retry, clearError, loading, isRetrying, error, data }`
  - Use `useRetryableFetch(url, { timeoutMs, ...init })` for simple HTTP calls with a timeout.

- Admin API: `hooks/useAdminApi.ts`
  - Option: `suppressToasts?: boolean` to avoid duplicate toast + error-card when using `NetworkError`.

Patterns
1) Minimal adoption (no hook)
   - Keep your existing fetch function; add a local `handleRetry` that calls it.
   - Render `NetworkError` when `error` is set.

   Example:
   const [isRetrying, setIsRetrying] = useState(false);
   const handleRetry = async () => { setIsRetrying(true); try { await fetchData(); } finally { setIsRetrying(false); } };
   return error ? <NetworkError error={error} onRetry={handleRetry} isRetrying={isRetrying} /> : ...

2) Using useRetryableFetch
   const { run, retry, error, loading, isRetrying } = useRetryableFetch<ResponseT>(`/api/foo`);
   useEffect(() => { run(); }, [run]);
   return error ? <NetworkError error={error} onRetry={retry} isRetrying={isRetrying} /> : ...

3) Layout-level retry
   - `AdminListPageLayout` and `AdminEditPageLayout` accept `onRetry` and `isRetrying`.
   - Pass your page’s refetch to the layout to unify top-level error UX.

When NOT to use
- Form validation/action errors should remain inline and contextual; do not replace with `NetworkError`.

Tips
- Use `suppressToasts: true` in `useAdminApi` when you render `NetworkError` to avoid double notifications.
- Keep messages short; rely on server logs for deep diagnostics.

