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

  if (err instanceof Error) {
    // Check for common viem/ethers error properties
    const maybe = err as any;

    // Viem's shortMessage is usually the most pithy and useful
    if (maybe.shortMessage) return maybe.shortMessage;

    // Handle specific RPC error codes if needed
    if (maybe.code === -32603) return "Internal JSON-RPC error. Check your balance or network.";

    return err.message;
  }

  if (typeof err === "string") return err;

  return defaultMessage;
};
