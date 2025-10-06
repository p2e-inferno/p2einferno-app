import { createPublicClientUnified } from "../config";
import { LockManagerService } from "../services/lock-manager";

/**
 * Factory for creating browser-scoped lock manager instances.
 * The wallet client is omitted because browser contexts should never
 * attempt privileged write operations.
 */
export const createBrowserLockManager = () => {
  const publicClient = createPublicClientUnified();
  return new LockManagerService(publicClient, null);
};
