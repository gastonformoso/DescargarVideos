import type { Page } from "../types";
import { Icon } from "./Icon";

interface TopbarProps {
  page: Page;
  activeCount: number;
  onNavigate: (page: Page) => void;
}

const META: Record<Page, { title: string; subtitle: string }> = {
  download: {
    title: "Descargar",
    subtitle: "Pega un enlace, revisa el contenido y guarda el archivo.",
  },
  queue: {
    title: "Descargas",
    subtitle: "Sigue el progreso y gestiona la cola de trabajo.",
  },
  history: {
    title: "Historial",
    subtitle: "Tus descargas anteriores, siempre a mano.",
  },
  settings: {
    title: "Configuración",
    subtitle: "Preferencias, carpeta predeterminada y herramientas.",
  },
};

export function Topbar({ page, activeCount, onNavigate }: TopbarProps) {
  const meta = META[page];
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-eyebrow">Biblioteca local</span>
        <div className="topbar-heading">
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="local-chip">
          <span className="status-dot is-success" />
          Procesamiento local
        </span>
        {activeCount > 0 && (
          <button type="button" className="active-chip" onClick={() => onNavigate("queue")}>
            <Icon name="loader" size={14} className="spin" />
            {activeCount} {activeCount === 1 ? "descarga activa" : "descargas activas"}
          </button>
        )}
      </div>
    </header>
  );
}
