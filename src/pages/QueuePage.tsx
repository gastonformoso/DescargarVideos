import { useState } from "react";

import { DownloadTaskCard } from "../components/DownloadTaskCard";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import type { DownloadTask, Page } from "../types";

type QueueFilter = "all" | "active" | "completed" | "failed";

interface QueuePageProps {
  tasks: DownloadTask[];
  maxConcurrent: number;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onClearFinished: () => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onReveal: (path: string) => void;
  onNavigate: (page: Page) => void;
  onError: (title: string, message?: string) => void;
}

const ACTIVE_STATUSES = ["starting", "downloading", "processing"];

export function QueuePage({
  tasks,
  maxConcurrent,
  onCancel,
  onRetry,
  onRemove,
  onClearFinished,
  onOpenFile,
  onOpenFolder,
  onReveal,
  onNavigate,
  onError,
}: QueuePageProps) {
  const [filter, setFilter] = useState<QueueFilter>("all");

  const active = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
  const queued = tasks.filter((task) => task.status === "queued");
  const completed = tasks.filter((task) => task.status === "completed");
  const failed = tasks.filter((task) => task.status === "failed" || task.status === "cancelled");

  const filtered = tasks.filter((task) => {
    if (filter === "active") {
      return task.status === "queued" || ACTIVE_STATUSES.includes(task.status);
    }
    if (filter === "completed") return task.status === "completed";
    if (filter === "failed") return task.status === "failed" || task.status === "cancelled";
    return true;
  });

  const filters: Array<{ value: QueueFilter; label: string; count: number }> = [
    { value: "all", label: "Todas", count: tasks.length },
    { value: "active", label: "Activas", count: active.length + queued.length },
    { value: "completed", label: "Completadas", count: completed.length },
    { value: "failed", label: "Con incidencias", count: failed.length },
  ];

  const hasFinished = completed.length + failed.length > 0;

  return (
    <div className="page-stack">
      <div className="stat-grid">
        <div className="stat-card surface">
          <span className="stat-icon tone-accent">
            <Icon name="download" size={19} />
          </span>
          <div>
            <span>Activas</span>
            <strong>{active.length}</strong>
          </div>
          <small>Máximo {maxConcurrent} a la vez</small>
        </div>
        <div className="stat-card surface">
          <span className="stat-icon tone-muted">
            <Icon name="clock" size={19} />
          </span>
          <div>
            <span>En cola</span>
            <strong>{queued.length}</strong>
          </div>
          <small>Esperando turno</small>
        </div>
        <div className="stat-card surface">
          <span className="stat-icon tone-success">
            <Icon name="checkCircle" size={19} />
          </span>
          <div>
            <span>Completadas</span>
            <strong>{completed.length}</strong>
          </div>
          <small>En esta sesión</small>
        </div>
        <div className="stat-card surface">
          <span className="stat-icon tone-danger">
            <Icon name="alertCircle" size={19} />
          </span>
          <div>
            <span>Incidencias</span>
            <strong>{failed.length}</strong>
          </div>
          <small>Fallidas o canceladas</small>
        </div>
      </div>

      <div className="page-toolbar surface">
        <div className="filter-tabs" role="tablist" aria-label="Filtrar descargas">
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
          className="button button-ghost button-sm"
          onClick={onClearFinished}
          disabled={!hasFinished}
        >
          <Icon name="trash" size={15} /> Limpiar finalizadas
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={filter === "all" ? "queue" : filter === "active" ? "download" : "history"}
            title={
              filter === "all"
                ? "No hay descargas todavía"
                : filter === "active"
                  ? "Nada en marcha ahora mismo"
                  : filter === "completed"
                    ? "Aún no hay descargas completadas"
                    : "Sin incidencias por aquí"
            }
            description={
              filter === "all"
                ? "Pega un enlace en la sección Descargar para iniciar tu primera descarga."
                : "Cuando haya actividad en esta categoría aparecerá aquí."
            }
            action={
              <button
                type="button"
                className="button button-primary button-sm"
                onClick={() => onNavigate("download")}
              >
                <Icon name="download" size={15} /> Nueva descarga
              </button>
            }
          />
        </div>
      ) : (
        <div className="task-list">
          {filtered.map((task) => (
            <DownloadTaskCard
              key={task.id}
              task={task}
              onCancel={(taskId) => void onCancel(taskId)}
              onRetry={onRetry}
              onRemove={onRemove}
              onOpenFile={onOpenFile}
              onOpenFolder={onOpenFolder}
              onReveal={onReveal}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
