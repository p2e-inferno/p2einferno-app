type ErrorLike = {
  code?: string | number;
  name?: string;
  message?: string;
  error?: {
    code?: string | number;
    message?: string;
  };
};

const USER_REJECTION_PATTERNS = [
  /\buser[\s_-]*rejected\b/i,
  /\buser[\s_-]*denied\b/i,
  /\buser[\s_-]*cancel(?:ed|led)\b/i,
];

export const isUserRejectedError = (err: unknown): boolean => {
  const typedErr: ErrorLike =
    typeof err === "object" && err !== null ? (err as ErrorLike) : {};

  const code = typedErr.code ?? typedErr.error?.code;
  const name = (typedErr.name || "").toLowerCase();
  const message = (
    typedErr.message ||
    typedErr.error?.message ||
    ""
  ).toLowerCase();

  return (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    name.includes("userrejected") ||
    USER_REJECTION_PATTERNS.some((pattern) => pattern.test(message))
  );
};

/**
 * Formats raw wallet/contract errors into user-friendly messages.
 * Specifically handles User Rejected errors to be minimal.
 */
export const formatWalletError = (err: unknown, defaultMessage = "Transaction failed"): string => {
  if (isUserRejectedError(err)) {
    return "Transaction cancelled";
  }

  const typedErr = typeof err === "object" && err !== null ? (err as ErrorLike & { shortMessage?: string }) : {};

  // 1. Viem's shortMessage is usually the most pithy and useful
  if (typedErr.shortMessage) return typedErr.shortMessage;

  // 2. Standard error message
  if (typedErr.message) return typedErr.message;

  // 3. Nested error object message
  if (typedErr.error?.message) return typedErr.error.message;

  // 4. Handle specific RPC error codes
  const code = typedErr.code ?? typedErr.error?.code;
  if (code === -32603) return "Internal JSON-RPC error. Check your balance or network.";
  if (code === 4001 || code === "ACTION_REJECTED") return "Transaction cancelled";

  if (typeof err === "string") return err;

  return defaultMessage;
};
