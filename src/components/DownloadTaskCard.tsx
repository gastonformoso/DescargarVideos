import {
  audioQualityLabel,
  formatBytes,
  formatEta,
  formatRelative,
  formatSpeed,
  isTerminal,
} from "../lib/format";
import type { DownloadTask } from "../types";
import { Icon } from "./Icon";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { Thumbnail } from "./Thumbnail";

interface DownloadTaskCardProps {
  task: DownloadTask;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onReveal: (path: string) => void;
  onError: (title: string, message?: string) => void;
}

function progressTone(task: DownloadTask) {
  if (task.status === "completed") return "success" as const;
  if (task.status === "failed") return "danger" as const;
  if (task.status === "cancelled") return "muted" as const;
  if (task.status === "processing") return "warning" as const;
  return "accent" as const;
}

export function DownloadTaskCard({
  task,
  onCancel,
  onRetry,
  onRemove,
  onOpenFile,
  onOpenFolder,
  onReveal,
  onError,
}: DownloadTaskCardProps) {
  const terminal = isTerminal(task.status);
  const qualityText =
    task.contentType === "audio" ? audioQualityLabel(task.quality) : task.quality === "best" ? "Mejor calidad" : `${task.quality}p`;
  const location = task.filePath ?? task.destination;

  const guarded = (action: () => void | Promise<void>, title: string) => {
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => {
        onError(title, error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <article className={`task-card surface status-${task.status}`}>
      <Thumbnail
        src={task.thumbnail}
        title={task.title}
        platform={task.platform}
        className="task-thumb"
      />

      <div className="task-main">
        <div className="task-heading">
          <div className="task-title-group">
            <h3 title={task.title}>{task.title}</h3>
            <div className="task-subtitle">
              <span>{task.platform}</span>
              <span className="dot-sep" />
              <span>{qualityText}</span>
              <span className="dot-sep" />
              <span>{task.format.toUpperCase()}</span>
              <span className="dot-sep" />
              <span>{formatRelative(task.createdAt)}</span>
            </div>
          </div>
          <StatusBadge status={task.status} />
        </div>

        {(task.status === "downloading" || task.status === "processing" || task.status === "starting") && (
          <>
            <div className="task-progress">
              <ProgressBar
                percent={task.percent}
                tone={progressTone(task)}
                animated={task.status === "processing" || task.status === "starting"}
              />
              <span className="task-percent">{Math.round(task.percent)}%</span>
            </div>
            <div className="task-metrics">
              <span>
                <Icon name="hardDrive" size={14} />
                {formatBytes(task.downloaded)} / {formatBytes(task.total)}
              </span>
              <span>
                <Icon name="gauge" size={14} />
                {formatSpeed(task.speed)}
              </span>
              <span>
                <Icon name="clock" size={14} />
                {task.eta != null ? `${formatEta(task.eta)} restantes` : "Calculando tiempo"}
              </span>
              {task.message && <span className="task-message">{task.message}</span>}
            </div>
          </>
        )}

        {task.status === "queued" && (
          <div className="task-note">
            <Icon name="clock" size={15} /> Esperando un espacio libre en la cola.
          </div>
        )}

        {task.status === "completed" && (
          <div className="task-note is-success">
            <Icon name="check" size={15} />
            <span className="path-text" title={location}>
              {location}
            </span>
          </div>
        )}

        {task.status === "failed" && (
          <div className="task-note is-danger">
            <Icon name="alert" size={15} />
            <span>{task.error ?? "La descarga no se pudo completar."}</span>
          </div>
        )}

        {task.status === "cancelled" && (
          <div className="task-note">
            <Icon name="close" size={15} />
            <span>{task.message ?? "Descarga cancelada."}</span>
          </div>
        )}

        <div className="task-actions">
          {!terminal && (
            <button type="button" className="button button-danger-ghost button-sm" onClick={() => onCancel(task.id)}>
              <Icon name="close" size={15} /> Cancelar
            </button>
          )}

          {task.status === "completed" && task.filePath && (
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => guarded(() => onOpenFile(task.filePath as string), "No se pudo abrir el archivo")}
            >
              <Icon name="play" size={15} /> Abrir archivo
            </button>
          )}

          {task.status === "completed" && (
            <>
              <button
                type="button"
                className="button button-ghost button-sm"
                onClick={() => guarded(() => onOpenFolder(task.destination), "No se pudo abrir la carpeta")}
              >
                <Icon name="folderOpen" size={15} /> Carpeta
              </button>
              {task.filePath && (
                <button
                  type="button"
                  className="icon-button"
                  title="Mostrar en el explorador"
                  onClick={() => guarded(() => onReveal(task.filePath as string), "No se pudo mostrar el archivo")}
                >
                  <Icon name="search" size={16} />
                </button>
              )}
            </>
          )}

          {(task.status === "failed" || task.status === "cancelled") && (
            <button type="button" className="button button-ghost button-sm" onClick={() => onRetry(task.id)}>
              <Icon name="rotate" size={15} /> Reintentar
            </button>
          )}

          {terminal && (
            <button
              type="button"
              className="icon-button task-remove"
              title="Quitar de la lista"
              onClick={() => onRemove(task.id)}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
