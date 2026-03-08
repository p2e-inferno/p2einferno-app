import React from "react";
import { toast, type Toast } from "react-hot-toast";

interface DismissibleToastProps {
  t: Toast;
  message: string;
  link?: {
    label: string;
    url: string;
  };
}

/**
 * Renders toast content showing the provided message with a visible close button that dismisses the associated toast.
 *
 * @param t - The toast instance whose id is used to dismiss this toast when the close button is clicked.
 * @param message - The text message displayed inside the toast.
 */
export function DismissibleToastContent({
  t,
  message,
  link,
}: DismissibleToastProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-start gap-3 w-full">
        <div className="flex-1 min-w-0 break-words font-medium">{message}</div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-current focus:ring-opacity-50 rounded p-0.5"
          aria-label="Dismiss notification"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
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
      {link && (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t.id);
          }}
          className="text-xs font-bold underline hover:opacity-80 transition-opacity w-fit flex items-center gap-1 text-inherit cursor-pointer"
        >
          {link.label}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
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
  return toast.success(
    (t) => <DismissibleToastContent t={t} message={message} />,
    { duration: 6000 },
  );
}

/**
 * Display a dismissible success toast with a link to the block explorer.
 */
export function showTransactionSuccess(message: string, explorerUrl: string) {
  return toast.success(
    (t) => (
      <DismissibleToastContent
        t={t}
        message={message}
        link={{ label: "View on Explorer", url: explorerUrl }}
      />
    ),
    { duration: 8000 },
  );
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
    duration: 5000,
  });
}
