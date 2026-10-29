import { useState } from "react";

import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { Thumbnail } from "../components/Thumbnail";
import { audioQualityLabel, formatDate, platformTone } from "../lib/format";
import type { HistoryRecord, Page } from "../types";

type HistoryFilter = "all" | "completed" | "failed" | "cancelled";

interface HistoryPageProps {
  records: HistoryRecord[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onReveal: (path: string) => void;
  onNavigate: (page: Page) => void;
  onError: (title: string, message?: string) => void;
}

export function HistoryPage({
  records,
  onRemove,
  onClear,
  onOpenFile,
  onOpenFolder,
  onReveal,
  onNavigate,
  onError,
}: HistoryPageProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const normalized = query.trim().toLowerCase();
  const filtered = records.filter((record) => {
    const matchesFilter = filter === "all" || record.status === filter;
    const matchesQuery =
      !normalized ||
      record.title.toLowerCase().includes(normalized) ||
      record.platform.toLowerCase().includes(normalized) ||
      record.url.toLowerCase().includes(normalized);
    return matchesFilter && matchesQuery;
  });

  const counts = {
    all: records.length,
    completed: records.filter((record) => record.status === "completed").length,
    failed: records.filter((record) => record.status === "failed").length,
    cancelled: records.filter((record) => record.status === "cancelled").length,
  };

  const filters: Array<{ value: HistoryFilter; label: string; count: number }> = [
    { value: "all", label: "Todas", count: counts.all },
    { value: "completed", label: "Completadas", count: counts.completed },
    { value: "failed", label: "Fallidas", count: counts.failed },
    { value: "cancelled", label: "Canceladas", count: counts.cancelled },
  ];

  const handleClear = () => {
    if (records.length === 0) return;
    const confirmed = window.confirm(
      "¿Vaciar el historial? Los archivos descargados no se eliminarán del disco.",
    );
    if (confirmed) onClear();
  };

  const guarded = (action: () => void | Promise<void>, title: string) => {
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => {
        onError(title, error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <div className="page-stack">
      <div className="history-toolbar surface">
        <div className="search-shell">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, plataforma o enlace…"
            aria-label="Buscar en el historial"
          />
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Filtrar historial">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              className={filter === item.value ? "is-active" : ""}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button button-danger-ghost button-sm"
          onClick={handleClear}
          disabled={records.length === 0}
        >
          <Icon name="trash" size={15} /> Vaciar historial
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon="history"
            title={records.length === 0 ? "Tu historial está vacío" : "No hay resultados"}
            description={
              records.length === 0
                ? "Las descargas completadas, fallidas o canceladas se registrarán aquí."
                : "Prueba con otro término de búsqueda o cambia el filtro."
            }
            action={
              records.length === 0 ? (
                <button
                  type="button"
                  className="button button-primary button-sm"
                  onClick={() => onNavigate("download")}
                >
                  <Icon name="download" size={15} /> Nueva descarga
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="history-list">
          {filtered.map((record) => {
            const qualityText =
              record.contentType === "audio"
                ? audioQualityLabel(record.quality)
                : record.quality === "best"
                  ? "Mejor calidad"
                  : `${record.quality}p`;
            const location = record.filePath ?? record.directory;

            return (
              <article key={record.id} className="history-card surface">
                <Thumbnail
                  src={record.thumbnail}
                  title={record.title}
                  platform={record.platform}
                  className="history-thumb"
                />
                <div className="history-main">
                  <div className="history-heading">
                    <div>
                      <h3 title={record.title}>{record.title}</h3>
                      <div className="history-meta">
                        <span className={`platform-badge tone-${platformTone(record.platform)}`}>
                          {record.platform}
                        </span>
                        <span>{qualityText}</span>
                        <span className="dot-sep" />
                        <span>{record.format.toUpperCase()}</span>
                        <span className="dot-sep" />
                        <span>{formatDate(record.finishedAt)}</span>
                      </div>
                    </div>
                    <StatusBadge status={record.status} />
                  </div>

                  <div className="history-location" title={location}>
                    <Icon name="file" size={14} />
                    <span>{location}</span>
                  </div>

                  {record.status === "failed" && record.error && (
                    <div className="history-error">
                      <Icon name="alert" size={14} />
                      <span>{record.error}</span>
                    </div>
                  )}
                  {record.status === "cancelled" && record.message && (
                    <div className="history-note">{record.message}</div>
                  )}
                </div>

                <div className="history-actions">
                  {record.status === "completed" && record.filePath && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Abrir archivo"
                      onClick={() =>
                        guarded(() => onOpenFile(record.filePath as string), "No se pudo abrir el archivo")
                      }
                    >
                      <Icon name="play" size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    title="Abrir carpeta"
                    onClick={() => guarded(() => onOpenFolder(record.directory), "No se pudo abrir la carpeta")}
                  >
                    <Icon name="folderOpen" size={16} />
                  </button>
                  {record.filePath && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Mostrar en el explorador"
                      onClick={() =>
                        guarded(() => onReveal(record.filePath as string), "No se pudo mostrar el archivo")
                      }
                    >
                      <Icon name="search" size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    title="Eliminar registro (no borra el archivo)"
                    onClick={() => onRemove(record.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
