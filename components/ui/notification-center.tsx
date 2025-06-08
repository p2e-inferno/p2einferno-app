import React from "react";
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotificationType = "success" | "error" | "warning" | "info";

interface NotificationProps {
  type: NotificationType;
  title?: string;
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
  className?: string;
}

const NotificationIcon = ({ type }: { type: NotificationType }) => {
  const iconProps = { className: "h-5 w-5" };

  switch (type) {
    case "success":
      return <CheckCircle {...iconProps} className="h-5 w-5 text-green-500" />;
    case "error":
      return <XCircle {...iconProps} className="h-5 w-5 text-red-500" />;
    case "warning":
      return <AlertCircle {...iconProps} className="h-5 w-5 text-amber-500" />;
    case "info":
      return <Info {...iconProps} className="h-5 w-5 text-blue-500" />;
    default:
      return <Info {...iconProps} className="h-5 w-5 text-blue-500" />;
  }
};

const getNotificationStyles = (type: NotificationType) => {
  const baseStyles = "border-l-4 rounded-r-lg shadow-md";

  switch (type) {
    case "success":
      return `${baseStyles} bg-green-50 border-green-500 text-green-800`;
    case "error":
      return `${baseStyles} bg-red-50 border-red-500 text-red-800`;
    case "warning":
      return `${baseStyles} bg-amber-50 border-amber-500 text-amber-800`;
    case "info":
      return `${baseStyles} bg-blue-50 border-blue-500 text-blue-800`;
    default:
      return `${baseStyles} bg-gray-50 border-gray-500 text-gray-800`;
  }
};

export const Notification: React.FC<NotificationProps> = ({
  type,
  title,
  message,
  onDismiss,
  dismissible = true,
  className,
}) => {
  return (
    <div
      className={cn(
        getNotificationStyles(type),
        "p-4 transition-all duration-300 ease-in-out",
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <NotificationIcon type={type} />
        </div>
        <div className="ml-3 flex-1">
          {title && <h3 className="text-sm font-medium mb-1">{title}</h3>}
          <p className="text-sm">{message}</p>
        </div>
        {dismissible && onDismiss && (
          <div className="ml-4 flex-shrink-0">
            <button
              type="button"
              className="inline-flex rounded-md p-1.5 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2"
              onClick={onDismiss}
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Preset notification components for common use cases
export const SuccessNotification: React.FC<Omit<NotificationProps, "type">> = (
  props
) => <Notification type="success" {...props} />;

export const ErrorNotification: React.FC<Omit<NotificationProps, "type">> = (
  props
) => <Notification type="error" {...props} />;

export const WarningNotification: React.FC<Omit<NotificationProps, "type">> = (
  props
) => <Notification type="warning" {...props} />;

export const InfoNotification: React.FC<Omit<NotificationProps, "type">> = (
  props
) => <Notification type="info" {...props} />;
