import { useNavigate } from "react-router-dom";
import type { Notification } from "@/types";

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  return then.toLocaleDateString();
}

export default function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    // Mark as read if unread
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }

    // Navigate to link if present
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    onDelete(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        relative px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer
        ${!notification.is_read ? "bg-brand-primary-light border-l-4 border-brand-primary" : "border-l-4 border-transparent"}
      `}
    >
      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="absolute top-3 right-3 text-content-muted hover:text-content-secondary"
        aria-label="Delete notification"
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

      {/* Content */}
      <div className="pr-8">
        <div className="flex items-start justify-between mb-1">
          <h4
            className={`text-sm ${!notification.is_read ? "font-semibold text-content-primary" : "font-medium text-content-secondary"}`}
          >
            {notification.title}
          </h4>
        </div>

        <p className="text-sm text-content-secondary mb-2">{notification.message}</p>

        <p className="text-xs text-content-muted">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </div>
  );
}
