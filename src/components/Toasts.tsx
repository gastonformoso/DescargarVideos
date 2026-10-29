import type { Toast } from "../types";
import { Icon, type IconName } from "./Icon";

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ICONS: Record<Toast["type"], IconName> = {
  success: "checkCircle",
  error: "alertCircle",
  info: "info",
};

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast tone-${toast.type}`}>
          <span className="toast-icon">
            <Icon name={ICONS[toast.type]} size={19} />
          </span>
          <div className="toast-body">
            <strong>{toast.title}</strong>
            {toast.message && <span>{toast.message}</span>}
          </div>
          <button
            type="button"
            className="icon-button toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar notificación"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
