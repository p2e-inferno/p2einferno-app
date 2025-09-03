type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const levelOrder: Record<Exclude<LogLevelName, 'silent'>, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isBrowser = typeof window !== 'undefined';
const nodeEnv = process.env.NODE_ENV || 'development';

function envLogLevel(): LogLevelName {
  const raw = (isBrowser
    ? process.env.NEXT_PUBLIC_LOG_LEVEL
    : process.env.LOG_LEVEL) || '';
  const val = raw.toLowerCase() as LogLevelName;
  if (val === 'debug' || val === 'info' || val === 'warn' || val === 'error' || val === 'silent') return val;
  return nodeEnv === 'development' ? 'debug' : 'info';
}

function shouldLog(level: Exclude<LogLevelName, 'silent'>, current: LogLevelName): boolean {
  if (current === 'silent') return false;
  return levelOrder[level] >= levelOrder[(current as Exclude<LogLevelName, 'silent'>)] ;
}

// Basic redaction helpers
function sanitizeString(input: string): string {
  if (!input) return input;
  let out = input;
  // redact common secret keys
  out = out.replace(/(priv(?:ate)?_?key|secret|password|token)=[^&\s]+/gi, '$1=[REDACTED]');
  // redact long hex keys
  out = out.replace(/0x[a-fA-F0-9]{64,}/g, (m) => `${m.slice(0, 6)}...[REDACTED]`);
  return out;
}

function sanitizeValue(val: any): any {
  if (typeof val === 'string') return sanitizeString(val);
  if (typeof val === 'object' && val !== null) {
    const clone: any = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      if (/password|secret|private|token/i.test(k)) {
        clone[k] = '[REDACTED]';
      } else if (/address/i.test(k) && typeof v === 'string' && v.startsWith('0x') && v.length >= 10) {
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
  debug: (message: string, context?: Record<string, any>) => void;
  info: (message: string, context?: Record<string, any>) => void;
  warn: (message: string, context?: Record<string, any>) => void;
  error: (message: string, context?: Record<string, any>) => void;
}

type TransportFn = (level: Exclude<LogLevelName, 'silent'>, payload: any) => void;

let currentLevel: LogLevelName = envLogLevel();

const defaultTransport: TransportFn = (level, payload) => {
  if (nodeEnv === 'development') {
    const msg = `[${payload.module}] ${payload.message}`;
    const ctx = payload.context;
    switch (level) {
      case 'debug':
        console.debug(msg, ctx);
        break;
      case 'info':
        console.info(msg, ctx);
        break;
      case 'warn':
        console.warn(msg, ctx);
        break;
      case 'error':
        console.error(msg, ctx);
        break;
    }
  } else {
    // JSON log for production
    console.log(JSON.stringify(payload));
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

  const emit = (level: Exclude<LogLevelName, 'silent'>, message: string, context?: Record<string, any>) => {
    if (!shouldLog(level, currentLevel)) return;
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      ...base,
      message: sanitizeString(message),
      context: sanitizeValue(context || {}),
      environment: nodeEnv,
      runtime: isBrowser ? 'browser' : 'server',
    };
    try {
      transport(level, payload);
    } catch (e) {
      // Fail-safe to avoid breaking app due to logging
      try { console.error('[logger] transport failure', e); } catch {}
    }
  };

  return {
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, c) => emit('error', m, c),
  };
}

// Convenience default logger
export const appLogger = getLogger('app');

