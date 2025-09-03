export function toMessage(err: unknown, fallback = "Something went wrong") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || fallback;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

export function isNetworkErrorMessage(message: string) {
  const msg = (message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("connection") ||
    msg.includes("unreachable") ||
    msg.includes("request aborted")
  );
}

export function normalizeHttpError(status: number, body?: any) {
  const details = body?.error || body?.message;
  if (status === 401) return details || "Authentication required";
  if (status === 403) return details || "Access forbidden";
  if (status === 404) return details || "Not found";
  if (status >= 500) return details || "Server error";
  return details || `HTTP ${status}`;
}

