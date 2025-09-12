# Logging

This project uses a lightweight, structured logger exposed via `getLogger(module)` from `lib/utils/logger`.

## Levels

- `debug`, `info`, `warn`, `error`, `silent`
- Defaults when env vars are not set:
  - Development: `debug`
  - Production: `silent`

## Transports and Output

- Server (Node/SSR): Writes to `process.stdout` / `process.stderr` (no `console.*`).
- Browser: Does not use `console.*`; logs are buffered to `window.__P2E_LOGS__` to avoid console spam and satisfy linting.
- Production format: JSON object per line. Development format: simple text with a small context object.

Note: Next.js `compiler.removeConsole` only strips `console.*` calls. The logger does not use `console.*`, so its output is unaffected by that setting.

### Developer Experience (Color/Formatting)

- In development on Node with a TTY, logs are colorized and formatted for readability:
  - Timestamp (dim), Level (colored), Module (bold), Message
  - Context is pretty-printed on the next lines, indented
- In production, logs are single-line JSON for easy ingestion.

## Environment Variables

- Server: `LOG_LEVEL` (one of `debug|info|warn|error|silent`)
- Client: `NEXT_PUBLIC_LOG_LEVEL` (same values; use sparingly)

Examples:

- Development: `LOG_LEVEL=debug`, optionally `NEXT_PUBLIC_LOG_LEVEL=debug`
- Staging: `LOG_LEVEL=info`, `NEXT_PUBLIC_LOG_LEVEL=warn` (temporary, if needed)
- Production: leave both unset (defaults to `silent`), or explicitly `LOG_LEVEL=error` for minimal server signals

## Best Practices

- Development: enable `debug` on server; enable client logs only if actively debugging browser issues.
- Production: keep client logs disabled (don’t set `NEXT_PUBLIC_LOG_LEVEL`). Prefer `LOG_LEVEL=error` or leave unset (which is `silent`).
- Avoid logging secrets. The logger sanitizes common tokens/long hex strings, but you should still prevent PII/secrets in log messages.

## Custom Transport (Optional)

You can override the transport for advanced cases, e.g. sending logs to a remote collector.

Server example:

```ts
import { setLoggerTransport } from '@/lib/utils/logger';

setLoggerTransport((level, payload) => {
  process.stdout.write(JSON.stringify(payload) + '\n');
});
```

Browser example:

```ts
import { setLoggerTransport } from '@/lib/utils/logger';

setLoggerTransport((level, payload) => {
  // Send to a logging endpoint
  fetch('/api/log', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {});
});
```

Edge runtimes may not support `process.stdout`; provide a custom transport if you need logs there.
