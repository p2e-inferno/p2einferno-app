export const isUserRejectedError = (err: unknown): boolean => {
  const anyErr = err as any;
  const code = anyErr?.code ?? anyErr?.error?.code;
  const name = (anyErr?.name || "").toString().toLowerCase();
  const message = (anyErr?.message || "").toString().toLowerCase();

  return (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    name.includes("userrejected") ||
    message.includes("user rejected") ||
    message.includes("rejected") ||
    message.includes("denied") ||
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled")
  );
};
