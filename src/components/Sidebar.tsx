import type { Page, ToolStatuses } from "../types";
import { Icon, type IconName } from "./Icon";

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  activeCount: number;
  historyCount: number;
  tools: ToolStatuses | null;
  version: string;
  demo: boolean;
}

const NAV_ITEMS: Array<{ page: Page; label: string; icon: IconName }> = [
  { page: "download", label: "Descargar", icon: "download" },
  { page: "queue", label: "Descargas", icon: "queue" },
  { page: "history", label: "Historial", icon: "history" },
  { page: "settings", label: "Configuración", icon: "settings" },
];

export function Sidebar({
  page,
  onNavigate,
  activeCount,
  historyCount,
  tools,
  version,
  demo,
}: SidebarProps) {
  const ready = Boolean(tools?.ytDlp.found && tools?.ffmpeg.found);
  const missingYtDlp = tools != null && !tools.ytDlp.found;

  return (
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => onNavigate("download")}>
        <span className="brand-mark">
          <Icon name="download" size={20} strokeWidth={2.2} />
        </span>
        <span className="brand-text">
          <strong>Video</strong>
          <span>Downloader</span>
        </span>
      </button>

      <nav className="nav" aria-label="Secciones principales">
        <span className="nav-heading">Espacio de trabajo</span>
        {NAV_ITEMS.map((item) => {
          const count =
            item.page === "queue" ? activeCount : item.page === "history" ? historyCount : 0;
          return (
            <button
              key={item.page}
              type="button"
              className={`nav-item${page === item.page ? " is-active" : ""}`}
              onClick={() => onNavigate(item.page)}
              aria-current={page === item.page ? "page" : undefined}
              title={item.label}
            >
              <Icon name={item.icon} size={19} />
              <span className="nav-label">{item.label}</span>
              {count > 0 && <span className="nav-count">{count > 99 ? "99+" : count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`engine-card${ready ? " is-ready" : ""}`}
          onClick={() => onNavigate("settings")}
          title="Estado del motor local"
        >
          <div className="engine-card-head">
            <span className={`status-dot ${ready ? "is-success" : "is-warning"}`} />
            <span>Motor local</span>
            <span className="engine-status">
              {tools == null ? "Comprobando" : missingYtDlp ? "Configurar" : ready ? "Listo" : "FFmpeg pendiente"}
            </span>
          </div>
          <div className="engine-row">
            <span>yt-dlp</span>
            <span className={tools?.ytDlp.found ? "ok" : "missing"}>
              {tools == null ? "…" : tools.ytDlp.found ? "Detectado" : "No encontrado"}
            </span>
          </div>
          <div className="engine-row">
            <span>FFmpeg</span>
            <span className={tools?.ffmpeg.found ? "ok" : "missing"}>
              {tools == null ? "…" : tools.ffmpeg.found ? "Detectado" : "No encontrado"}
            </span>
          </div>
        </button>

        <div className="sidebar-version">
          <span>v{version || "0.1.0"}</span>
          {demo && <span className="demo-badge">DEMO WEB</span>}
        </div>
      </div>
    </aside>
  );
}
