/**
 * Utility functions for toast notifications
 */

/**
 * Truncates a long error message to a reasonable length for toast display
 * @param message - The error message to truncate
 * @param maxLength - Maximum length before truncation (default: 200)
 * @returns Truncated message with ellipsis if needed
 */
import { toast, type ToastOptions } from "react-hot-toast";

export function truncateErrorMessage(
  message: string,
  maxLength: number = 200,
): string {
  if (!message || message.length <= maxLength) {
    return message;
  }

  // Try to find a good break point (end of sentence, comma, etc.)
  const truncated = message.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );

  const lastComma = truncated.lastIndexOf(",");
  const breakPoint = Math.max(lastSentenceEnd, lastComma);

  if (breakPoint > maxLength * 0.7) {
    // If we found a good break point that's not too early, use it
    return message.substring(0, breakPoint + 1) + "...";
  }

  // Otherwise, just truncate at maxLength
  return truncated + "...";
}

/**
 * Formats an error message for toast display with proper line breaks
 * @param message - The error message to format
 * @param maxLength - Maximum length per line (default: 200)
 * @returns Formatted message with line breaks
 */
export function formatErrorMessageForToast(
  message: string,
  maxLength: number = 200,
): string {
  const truncated = truncateErrorMessage(message, maxLength);

  // Add line breaks for better readability in toast
  return truncated.replace(/\. /g, ".\n").replace(/, /g, ",\n");
}

/**
 * Displays a blue informational toast with consistent styling
 */
export function showInfoToast(message: string, options?: ToastOptions) {
  toast(message, {
    icon: "ℹ️",
    style: {
      background: "#1d4ed8",
      color: "#fff",
    },
    ...options,
  });
}
