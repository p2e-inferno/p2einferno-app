/**
 * Sequential HTTP Transport for Viem
 *
 * Provides a robust RPC transport that automatically fails over between multiple
 * blockchain RPC endpoints. Implements sequential retry logic with exponential
 * backoff to ensure high availability for blockchain operations.
 *
 **/

import { createTransport, http } from "viem";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Configuration for creating a sequential HTTP transport with failover support
 */
interface CreateSequentialTransportArgs {
  urls: string[];
  timeoutMs: number;
  retryDelayMs: number;
  batch?: boolean | { wait?: number; batchSize?: number };
}

/**
 * Determines if a JSON-RPC error should not be retried
 * Non-retryable errors include malformed requests, method not found, and invalid params
 */
const isNonRetryableJsonRpcError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as Record<string, unknown> & { code?: number };
  const code =
    maybeError.code ??
    (maybeError.cause as { code?: number } | undefined)?.code;

  if (code === undefined) {
    return false;
  }

  // JSON-RPC standard error codes that indicate permanent failures
  return code === -32600 || code === -32601 || code === -32602;
};

/**
 * Creates a Viem transport that sequentially tries multiple RPC endpoints
 * Provides automatic failover and retry logic for high availability
 */
export const createSequentialHttpTransport = ({
  urls,
  timeoutMs,
  retryDelayMs,
  batch,
}: CreateSequentialTransportArgs) => {
  // Remove duplicates and empty URLs
  const deduped = Array.from(new Set(urls.filter(Boolean)));

  if (deduped.length === 0) {
    throw new Error("No RPC URLs configured");
  }

  // Create individual HTTP transports for each endpoint
  const transports = deduped.map((url) =>
    http(url, {
      timeout: timeoutMs,
      retryCount: 0, // Disable built-in retries, we handle them manually
      retryDelay: retryDelayMs,
      batch,
    }),
  );

  // Track the last successful endpoint for round-robin optimization
  let lastGoodIndex = 0;

  return ({ chain, timeout: timeout_ }: any) => {
    const timeout = timeout_ ?? timeoutMs;

    return createTransport(
      {
        key: "http-sequential",
        name: "HTTP JSON-RPC (sequential)",
        type: "http",
        retryCount: 0,
        retryDelay: retryDelayMs,
        timeout,
        async request(requestArgs) {
          const total = transports.length;
          let lastError: unknown;
          // Start from the last successful endpoint for optimization
          const startIndex = lastGoodIndex % total;

          // Try each endpoint sequentially
          for (let attempt = 0; attempt < total; attempt += 1) {
            const index = (startIndex + attempt) % total;
            const transport = transports[index]!({
              chain,
              retryCount: 0,
              timeout,
            });

            try {
              const result = await transport.request(requestArgs as any);
              lastGoodIndex = index; // Remember successful endpoint
              return result as any;
            } catch (error) {
              // Don't retry permanent failures
              if (isNonRetryableJsonRpcError(error)) {
                throw error;
              }

              lastError = error;

              // Add exponential backoff with jitter before next attempt
              if (attempt < total - 1) {
                const baseDelay = Math.min(retryDelayMs * (attempt + 1), 1500);
                const jitter = baseDelay * (0.5 + Math.random());
                await sleep(jitter);
              }
            }
          }

          throw lastError ?? new Error("All RPC endpoints failed");
        },
      },
      { url: deduped[lastGoodIndex % deduped.length] },
    );
  };
};
