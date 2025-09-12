type LogLevelName = "debug" | "info" | "warn" | "error" | "silent";

const levelOrder: Record<Exclude<LogLevelName, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isBrowser = typeof window !== "undefined";
const nodeEnv = process.env.NODE_ENV || "development";

function envLogLevel(): LogLevelName {
  const raw =
    (isBrowser ? process.env.NEXT_PUBLIC_LOG_LEVEL : process.env.LOG_LEVEL) ||
    "";
  const val = raw.toLowerCase() as LogLevelName;
  if (
    val === "debug" ||
    val === "info" ||
    val === "warn" ||
    val === "error" ||
    val === "silent"
  )
    return val;
  // Default to verbose in development, silent in production if not explicitly set
  return nodeEnv === "development" ? "debug" : "silent";
}

function shouldLog(
  level: Exclude<LogLevelName, "silent">,
  current: LogLevelName,
): boolean {
  if (current === "silent") return false;
  return (
    levelOrder[level] >= levelOrder[current as Exclude<LogLevelName, "silent">]
  );
}

// Basic redaction helpers
function sanitizeString(input: string): string {
  if (!input) return input;
  let out = input;
  // redact common secret keys
  out = out.replace(
    /(priv(?:ate)?_?key|secret|password|token)=[^&\s]+/gi,
    "$1=[REDACTED]",
  );
  // redact long hex keys
  out = out.replace(
    /0x[a-fA-F0-9]{64,}/g,
    (m) => `${m.slice(0, 6)}...[REDACTED]`,
  );
  return out;
}

function sanitizeValue(val: any): any {
  if (typeof val === "string") return sanitizeString(val);
  if (typeof val === "object" && val !== null) {
    const clone: any = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      if (/password|secret|private|token/i.test(k)) {
        clone[k] = "[REDACTED]";
      } else if (
        /address/i.test(k) &&
        typeof v === "string" &&
        v.startsWith("0x") &&
        v.length >= 10
      ) {
        clone[k] = `${v.slice(0, 6)}...${v.slice(-4)}`;
      } else {
        clone[k] = sanitizeValue(v);
      }
    }
    return clone;
  }
  return val;
}

export interface AppLogger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

type TransportFn = (
  level: Exclude<LogLevelName, "silent">,
  payload: any,
) => void;

let currentLevel: LogLevelName = envLogLevel();

// Internal writer to avoid console usage (satisfies no-console)
const writeLine = (
  stream: "stdout" | "stderr",
  text: string,
  ctx?: any,
) => {
  if (isBrowser) {
    // In browsers, avoid console.* to satisfy lint; optionally buffer logs
    try {
      // Attach to a debug buffer if present (no-op otherwise)
      (window as any).__P2E_LOGS__ = (window as any).__P2E_LOGS__ || [];
      (window as any).__P2E_LOGS__.push({ text, ctx });
    } catch {}
    return;
  }
  try {
    // Avoid referencing Node's global `process` directly to stay Edge-safe
    const proc: any = (globalThis as any)?.["process"];
    const out = stream === "stderr" ? proc?.stderr : proc?.stdout;
    if (!out || typeof out.write !== "function") return;
    const suffix = ctx && Object.keys(ctx || {}).length
      ? ` ${JSON.stringify(ctx)}`
      : "";
    out.write(`${text}${suffix}\n`);
  } catch {}
};

const defaultTransport: TransportFn = (level, payload) => {
  if (nodeEnv === "development") {
    const msg = `[${payload.module}] ${payload.message}`;
    const ctx = payload.context;
    if (level === "warn" || level === "error") {
      writeLine("stderr", msg, ctx);
    } else {
      writeLine("stdout", msg, ctx);
    }
  } else {
    // JSON log for production
    writeLine("stdout", JSON.stringify(payload));
  }
};

let transport: TransportFn = defaultTransport;

export function setLogLevel(level: LogLevelName) {
  currentLevel = level;
}

export function setLoggerTransport(fn: TransportFn) {
  transport = fn;
}

export function getLogger(moduleName: string): AppLogger {
  const base = {
    module: moduleName,
  };

  const emit = (level: Exclude<LogLevelName, "silent">, ...args: any[]) => {
    if (!shouldLog(level, currentLevel)) return;
    const [first, ...rest] = args;
    const isStringMessage = typeof first === "string";
    const message = isStringMessage ? (first as string) : "[log]";
    const rawContext = isStringMessage
      ? rest.length === 0
        ? undefined
        : rest.length === 1
          ? rest[0]
          : rest
      : typeof first !== "undefined"
        ? rest.length
          ? [first, ...rest]
          : first
        : undefined;
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      ...base,
      message: sanitizeString(message),
      context: sanitizeValue(rawContext ?? {}),
      environment: nodeEnv,
      runtime: isBrowser ? "browser" : "server",
    };
    try {
      transport(level, payload);
    } catch (e) {
      // Fail-safe to avoid breaking app due to logging
      try {
        writeLine("stderr", "[logger] transport failure", e as any);
      } catch {}
    }
  };

  return {
    debug: (...args) => emit("debug", ...args),
    info: (...args) => emit("info", ...args),
    warn: (...args) => emit("warn", ...args),
    error: (...args) => emit("error", ...args),
  };
}

// Convenience default logger
export const appLogger = getLogger("app");
