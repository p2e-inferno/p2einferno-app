/**
 * useVisibilityAwarePoll Hook
 * Manages polling intervals with automatic pause/resume based on page visibility
 * Reduces network load and battery drain when tab is not focused
 */

import { useEffect, useRef, useCallback } from 'react';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useVisibilityAwarePoll');

export interface UseVisibilityAwarePollOptions {
  enabled?: boolean;
  onPausePolling?: () => void;
  onResumePolling?: () => void;
}

/**
 * Custom hook for visibility-aware polling
 * @param callback - Function to call on each poll interval
 * @param interval - Poll interval in milliseconds
 * @param options - Configuration options
 * @returns Object with stopPolling and startPolling methods
 */
export const useVisibilityAwarePoll = (
  callback: () => void | Promise<void>,
  interval: number,
  options: UseVisibilityAwarePollOptions = {},
) => {
  const { enabled = true, onPausePolling, onResumePolling } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  const startPolling = useCallback(() => {
    if (!enabled || isPollingRef.current) return;

    isPollingRef.current = true;
    log.debug('Starting visibility-aware polling', { interval });
    onResumePolling?.();

    intervalRef.current = setInterval(() => {
      callback();
    }, interval);
  }, [callback, interval, enabled, onResumePolling]);

  const stopPolling = useCallback(() => {
    if (!isPollingRef.current) return;

    isPollingRef.current = false;
    log.debug('Stopping visibility-aware polling');
    onPausePolling?.();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [onPausePolling]);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    // Start polling initially if visible and enabled
    if (enabled && !document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [startPolling, stopPolling, enabled]);

  return { stopPolling, startPolling };
};
