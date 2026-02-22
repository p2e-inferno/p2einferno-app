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
  /\buser[\s_-]*rejected\s+transaction\b/i,
  /\buser[\s_-]*denied\s+transaction\b/i,
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
