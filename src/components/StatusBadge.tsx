import type { DownloadStatus } from "../types";
import { Icon, type IconName } from "./Icon";

const STATUS_META: Record<
  DownloadStatus,
  { label: string; tone: string; icon: IconName; spin?: boolean }
> = {
  queued: { label: "En cola", tone: "muted", icon: "clock" },
  starting: { label: "Iniciando", tone: "accent", icon: "loader", spin: true },
  downloading: { label: "Descargando", tone: "accent", icon: "download" },
  processing: { label: "Procesando", tone: "warning", icon: "loader", spin: true },
  completed: { label: "Completada", tone: "success", icon: "checkCircle" },
  failed: { label: "Fallida", tone: "danger", icon: "alertCircle" },
  cancelled: { label: "Cancelada", tone: "muted", icon: "close" },
};

export function StatusBadge({ status }: { status: DownloadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`status-badge tone-${meta.tone}`}>
      <Icon
        name={meta.icon}
        size={13}
        strokeWidth={2}
        className={meta.spin ? "spin" : undefined}
      />
      {meta.label}
    </span>
  );
}
