import React from "react";
import { toast, type Toast } from "react-hot-toast";

interface DismissibleToastProps {
  t: Toast;
  message: string;
}

/**
 * Renders toast content showing the provided message with a visible close button that dismisses the associated toast.
 *
 * @param t - The toast instance whose id is used to dismiss this toast when the close button is clicked.
 * @param message - The text message displayed inside the toast.
 */
export function DismissibleToastContent({ t, message }: DismissibleToastProps) {
  return (
    <div className="flex items-start gap-3 w-full">
      <div className="flex-1 min-w-0 break-words">{message}</div>
      <button
        onClick={() => toast.dismiss(t.id)}
        className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-current focus:ring-opacity-50 rounded"
        aria-label="Dismiss notification"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * Displays an error toast with a dismiss button showing the provided message.
 *
 * @returns The id of the created toast.
 */
export function showDismissibleError(message: string) {
  return toast.error(
    (t) => <DismissibleToastContent t={t} message={message} />,
    { duration: 6000 },
  );
}

/**
 * Display a dismissible success toast with a visible close button.
 *
 * @param message - The message text to display inside the toast
 * @returns The id of the created toast
 */
export function showDismissibleSuccess(message: string) {
  return toast.success((t) => (
    <DismissibleToastContent t={t} message={message} />
  ));
}

/**
 * Display an informational toast that includes a visible dismiss button.
 *
 * @param message - The text to display inside the toast
 * @returns The id of the shown toast
 */
export function showDismissibleInfo(message: string) {
  return toast((t) => <DismissibleToastContent t={t} message={message} />, {
    icon: "ℹ️",
  });
}