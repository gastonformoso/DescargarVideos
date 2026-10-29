import { useCallback, useEffect, useRef, useState } from "react";

import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { Topbar } from "./components/Topbar";
import { useDownloads } from "./hooks/useDownloads";
import { usePersistentState } from "./hooks/usePersistentState";
import { useToasts } from "./hooks/useToasts";
import { isActive, isTerminal } from "./lib/format";
import {
  checkTools,
  getDefaults,
  isDemoMode,
  openFile,
  openFolder,
  revealPath,
  updateYtDlp,
} from "./lib/tauri";
import { DownloadPage } from "./pages/DownloadPage";
import { HistoryPage } from "./pages/HistoryPage";
import { QueuePage } from "./pages/QueuePage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  Accent,
  AppDefaults,
  ContentType,
  DownloadDraft,
  DuplicatePolicy,
  HistoryRecord,
  Page,
  Settings,
  ToolStatuses,
} from "./types";

const DEFAULT_SETTINGS: Settings = {
  defaultDirectory: "",
  defaultContentType: "video",
  defaultQuality: "best",
  defaultAudioQuality: "best",
  defaultVideoFormat: "mp4",
  defaultAudioFormat: "mp3",
  duplicatePolicy: "rename",
  maxConcurrent: 1,
  openFolderOnComplete: false,
  showNotifications: true,
  accent: "violet",
};

const ACCENTS: Accent[] = ["violet", "cyan", "emerald", "rose"];
const CONTENT_TYPES: ContentType[] = ["video", "audio"];
const POLICIES: DuplicatePolicy[] = ["rename", "overwrite", "skip"];

function reviveSettings(stored: unknown): Settings {
  if (!stored || typeof stored !== "object") return DEFAULT_SETTINGS;
  const raw = stored as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    defaultDirectory:
      typeof raw.defaultDirectory === "string"
        ? raw.defaultDirectory
        : DEFAULT_SETTINGS.defaultDirectory,
    defaultContentType: CONTENT_TYPES.includes(raw.defaultContentType as ContentType)
      ? (raw.defaultContentType as ContentType)
      : DEFAULT_SETTINGS.defaultContentType,
    defaultQuality:
      typeof raw.defaultQuality === "string" ? raw.defaultQuality : DEFAULT_SETTINGS.defaultQuality,
    defaultAudioQuality:
      typeof raw.defaultAudioQuality === "string"
        ? raw.defaultAudioQuality
        : DEFAULT_SETTINGS.defaultAudioQuality,
    defaultVideoFormat:
      typeof raw.defaultVideoFormat === "string"
        ? raw.defaultVideoFormat
        : DEFAULT_SETTINGS.defaultVideoFormat,
    defaultAudioFormat:
      typeof raw.defaultAudioFormat === "string"
        ? raw.defaultAudioFormat
        : DEFAULT_SETTINGS.defaultAudioFormat,
    duplicatePolicy: POLICIES.includes(raw.duplicatePolicy as DuplicatePolicy)
      ? (raw.duplicatePolicy as DuplicatePolicy)
      : DEFAULT_SETTINGS.duplicatePolicy,
    maxConcurrent:
      typeof raw.maxConcurrent === "number" && raw.maxConcurrent >= 1 && raw.maxConcurrent <= 3
        ? Math.round(raw.maxConcurrent)
        : DEFAULT_SETTINGS.maxConcurrent,
    openFolderOnComplete:
      typeof raw.openFolderOnComplete === "boolean"
        ? raw.openFolderOnComplete
        : DEFAULT_SETTINGS.openFolderOnComplete,
    showNotifications:
      typeof raw.showNotifications === "boolean"
        ? raw.showNotifications
        : DEFAULT_SETTINGS.showNotifications,
    accent: ACCENTS.includes(raw.accent as Accent)
      ? (raw.accent as Accent)
      : DEFAULT_SETTINGS.accent,
  };
}

function reviveHistory(stored: unknown): HistoryRecord[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item): item is HistoryRecord => {
      if (!item || typeof item !== "object") return false;
      const record = item as Partial<HistoryRecord>;
      return (
        typeof record.id === "string" &&
        typeof record.title === "string" &&
        typeof record.url === "string" &&
        typeof record.platform === "string" &&
        typeof record.createdAt === "number" &&
        typeof record.finishedAt === "number"
      );
    })
    .slice(0, 300);
}

export default function App() {
  const [page, setPage] = useState<Page>("download");
  const [settings, setSettings] = usePersistentState<Settings>(
    "vd.settings.v1",
    DEFAULT_SETTINGS,
    reviveSettings,
  );
  const [history, setHistory] = usePersistentState<HistoryRecord[]>(
    "vd.history.v1",
    [],
    reviveHistory,
  );
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [tools, setTools] = useState<ToolStatuses | null>(null);
  const [updatingTools, setUpdatingTools] = useState(false);

  const { toasts, remove: removeToast, error: toastError, info: toastInfo, success } = useToasts();

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
  }, [settings.accent]);

  useEffect(() => {
    let cancelled = false;
    getDefaults()
      .then((data) => {
        if (cancelled) return;
        setDefaults(data);
        setTools(data.tools);
        setSettings((current) =>
          current.defaultDirectory
            ? current
            : { ...current, defaultDirectory: data.downloadDir },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toastError(
          "No se pudo iniciar la aplicación",
          error instanceof Error ? error.message : String(error),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [setSettings, toastError]);

  const downloads = useDownloads({ settings, onError: toastError });

  const finalizedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const finished = downloads.tasks.filter(
      (task) => isTerminal(task.status) && !finalizedRef.current.has(task.id),
    );
    if (finished.length === 0) return;

    finished.forEach((task) => {
      finalizedRef.current.add(task.id);
      const record: HistoryRecord = {
        id: task.id,
        url: task.url,
        title: task.title,
        platform: task.platform,
        thumbnail: task.thumbnail,
        contentType: task.contentType,
        quality: task.quality,
        format: task.format,
        directory: task.destination,
        fileName: task.filename,
        filePath: task.filePath,
        status: task.status as HistoryRecord["status"],
        message: task.message,
        error: task.error,
        createdAt: task.createdAt,
        finishedAt: task.finishedAt ?? Date.now(),
      };
      setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 300));

      if (settingsRef.current.showNotifications) {
        if (task.status === "completed") {
          success("Descarga completada", task.title);
        } else if (task.status === "failed") {
          toastError("La descarga falló", task.error ?? task.title);
        } else {
          toastInfo("Descarga cancelada", task.title);
        }
      }

      if (task.status === "completed" && settingsRef.current.openFolderOnComplete) {
        if (task.filePath) {
          void revealPath(task.filePath).catch(() => undefined);
        } else {
          void openFolder(task.destination).catch(() => undefined);
        }
      }
    });
  }, [downloads.tasks, setHistory, success, toastError, toastInfo]);

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => ({ ...current, ...patch }));
    },
    [setSettings],
  );

  const handleEnqueue = useCallback(
    (draft: DownloadDraft) => {
      downloads.enqueue(draft);
      toastInfo("Añadido a la cola", draft.title);
    },
    [downloads, toastInfo],
  );

  const handleOpenFile = useCallback(
    async (path: string) => {
      try {
        await openFile(path);
      } catch (error) {
        toastError(
          "No se pudo abrir el archivo",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [toastError],
  );

  const handleOpenFolder = useCallback(
    async (path: string) => {
      try {
        await openFolder(path);
      } catch (error) {
        toastError(
          "No se pudo abrir la carpeta",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [toastError],
  );

  const handleReveal = useCallback(
    async (path: string) => {
      try {
        await revealPath(path);
      } catch (error) {
        toastError(
          "No se pudo mostrar el archivo",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [toastError],
  );

  const handleRefreshTools = useCallback(() => {
    checkTools()
      .then((statuses) => {
        setTools(statuses);
        toastInfo("Herramientas comprobadas", "El estado del motor local está actualizado.");
      })
      .catch((error: unknown) => {
        toastError(
          "No se pudo comprobar el motor",
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [toastError, toastInfo]);

  const handleUpdateTools = useCallback(() => {
    setUpdatingTools(true);
    updateYtDlp()
      .then((statuses) => {
        setTools(statuses);
        success("yt-dlp actualizado", "El motor de descargas está listo.");
      })
      .catch((error: unknown) => {
        toastError(
          "No se pudo actualizar yt-dlp",
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setUpdatingTools(false));
  }, [success, toastError]);

  const handleRemoveHistory = useCallback(
    (id: string) => {
      setHistory((current) => current.filter((record) => record.id !== id));
    },
    [setHistory],
  );

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  const runningCount = downloads.tasks.filter((task) =>
    ["starting", "downloading", "processing"].includes(task.status),
  ).length;
  const queueCount = downloads.tasks.filter((task) => isActive(task.status)).length;

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        onNavigate={setPage}
        activeCount={queueCount}
        historyCount={history.length}
        tools={tools}
        version={defaults?.appVersion ?? "0.1.0"}
        demo={isDemoMode}
      />

      <main className="main">
        <Topbar page={page} activeCount={runningCount} onNavigate={setPage} />
        <div className="page-scroll">
          {page === "download" && (
            <DownloadPage
              settings={settings}
              tools={tools}
              recentTasks={downloads.tasks}
              onEnqueue={handleEnqueue}
              onNavigate={setPage}
              onError={toastError}
            />
          )}

          {page === "queue" && (
            <QueuePage
              tasks={downloads.tasks}
              maxConcurrent={settings.maxConcurrent}
              onCancel={(taskId) => void downloads.cancel(taskId)}
              onRetry={downloads.retry}
              onRemove={downloads.remove}
              onClearFinished={downloads.clearFinished}
              onOpenFile={handleOpenFile}
              onOpenFolder={handleOpenFolder}
              onReveal={handleReveal}
              onNavigate={setPage}
              onError={toastError}
            />
          )}

          {page === "history" && (
            <HistoryPage
              records={history}
              onRemove={handleRemoveHistory}
              onClear={handleClearHistory}
              onOpenFile={handleOpenFile}
              onOpenFolder={handleOpenFolder}
              onReveal={handleReveal}
              onNavigate={setPage}
              onError={toastError}
            />
          )}

          {page === "settings" && (
            <SettingsPage
              settings={settings}
              onChange={handleSettingsChange}
              tools={tools}
              appVersion={defaults?.appVersion ?? "0.1.0"}
              demo={isDemoMode}
              updatingTools={updatingTools}
              onRefreshTools={handleRefreshTools}
              onUpdateTools={handleUpdateTools}
              onError={toastError}
            />
          )}
        </div>
      </main>

      <Toasts toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
