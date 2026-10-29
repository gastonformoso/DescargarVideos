import { useCallback, useEffect, useRef, useState } from "react";

import { isActive, isTerminal } from "../lib/format";
import { cancelDownload, onDownloadEvent, startDownload } from "../lib/tauri";
import type {
  DownloadDraft,
  DownloadEventPayload,
  DownloadTask,
  Settings,
} from "../types";

interface UseDownloadsOptions {
  settings: Settings;
  onError: (title: string, message?: string) => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function eventPatch(task: DownloadTask, payload: DownloadEventPayload): DownloadTask {
  const finished = isTerminal(payload.status);
  return {
    ...task,
    status: payload.status,
    percent:
      payload.percent != null
        ? Math.max(0, Math.min(100, payload.percent))
        : payload.status === "completed"
          ? 100
          : task.percent,
    downloaded: payload.downloaded ?? task.downloaded,
    total: payload.total ?? task.total,
    speed: payload.speed ?? task.speed,
    eta: payload.eta ?? task.eta,
    filePath: payload.filePath ?? task.filePath,
    error: payload.status === "failed" ? (payload.error ?? "La descarga falló.") : null,
    message: payload.message ?? (finished ? null : task.message),
    finishedAt: finished ? (task.finishedAt ?? Date.now()) : null,
  };
}

export function useDownloads({ settings, onError }: UseDownloadsOptions) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const tasksRef = useRef(tasks);
  const startingRef = useRef<Set<string>>(new Set());
  const cancelRequestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const updateTask = useCallback(
    (taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? updater(task) : task)),
      );
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    onDownloadEvent((payload) => {
      if (disposed) return;
      const requestedCancel = cancelRequestedRef.current.has(payload.taskId);

      if (requestedCancel && payload.status !== "cancelled" && !isTerminal(payload.status)) {
        return;
      }

      updateTask(payload.taskId, (task) => eventPatch(task, payload));

      if (payload.status === "cancelled") {
        cancelRequestedRef.current.delete(payload.taskId);
      }
    })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        onError("No se pudo escuchar el progreso de las descargas", message);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onError, updateTask]);

  const launch = useCallback(
    async (task: DownloadTask) => {
      if (startingRef.current.has(task.id)) return;
      startingRef.current.add(task.id);

      const latest = tasksRef.current.find((entry) => entry.id === task.id);
      if (!latest || latest.status !== "queued") {
        startingRef.current.delete(task.id);
        return;
      }

      updateTask(task.id, (entry) => ({
        ...entry,
        status: "starting",
        error: null,
        message: "Preparando la descarga...",
      }));

      try {
        await startDownload({
          taskId: latest.id,
          url: latest.url,
          title: latest.title,
          contentType: latest.contentType,
          quality: latest.quality,
          format: latest.format,
          destination: latest.destination,
          filename: latest.filename,
          duplicatePolicy: latest.duplicatePolicy,
        });

        if (cancelRequestedRef.current.has(latest.id)) {
          await cancelDownload(latest.id).catch(() => undefined);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cancelRequestedRef.current.has(latest.id)) {
          updateTask(latest.id, (entry) => ({
            ...entry,
            status: "cancelled",
            message: "Descarga cancelada por el usuario.",
            finishedAt: Date.now(),
          }));
        } else {
          updateTask(latest.id, (entry) => ({
            ...entry,
            status: "failed",
            error: message,
            message: null,
            finishedAt: Date.now(),
          }));
          onError("No se pudo iniciar la descarga", message);
        }
      } finally {
        startingRef.current.delete(task.id);
      }
    },
    [onError, updateTask],
  );

  useEffect(() => {
    const current = tasksRef.current;
    const activeCount = current.filter((task) => task.status !== "queued" && isActive(task.status)).length;
    const slots = Math.max(0, settings.maxConcurrent - activeCount);
    if (slots === 0) return;

    current
      .filter((task) => task.status === "queued")
      .slice(0, slots)
      .forEach((task) => {
        void launch(task);
      });
  }, [launch, settings.maxConcurrent, tasks]);

  const enqueue = useCallback((draft: DownloadDraft): string => {
    const task: DownloadTask = {
      ...draft,
      id: createId(),
      status: "queued",
      percent: 0,
      downloaded: null,
      total: null,
      speed: null,
      eta: null,
      filePath: null,
      error: null,
      message: null,
      createdAt: Date.now(),
      finishedAt: null,
    };
    setTasks((current) => [task, ...current]);
    return task.id;
  }, []);

  const cancel = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.find((entry) => entry.id === taskId);
      if (!task || isTerminal(task.status)) return;

      if (task.status === "queued") {
        cancelRequestedRef.current.add(taskId);
        updateTask(taskId, (entry) => ({
          ...entry,
          status: "cancelled",
          message: "Descarga cancelada por el usuario.",
          finishedAt: Date.now(),
        }));
        return;
      }

      cancelRequestedRef.current.add(taskId);

      if (task.status === "starting") {
        updateTask(taskId, (entry) => ({
          ...entry,
          status: "cancelled",
          message: "Descarga cancelada por el usuario.",
          finishedAt: Date.now(),
        }));
      }

      try {
        await cancelDownload(taskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (task.status !== "starting") {
          cancelRequestedRef.current.delete(taskId);
          onError("No se pudo cancelar la descarga", message);
        }
      }
    },
    [onError, updateTask],
  );

  const retry = useCallback((taskId: string) => {
    const task = tasksRef.current.find((entry) => entry.id === taskId);
    if (!task || !isTerminal(task.status)) return;

    const retried: DownloadTask = {
      ...task,
      id: createId(),
      status: "queued",
      percent: 0,
      downloaded: null,
      total: null,
      speed: null,
      eta: null,
      filePath: null,
      error: null,
      message: null,
      createdAt: Date.now(),
      finishedAt: null,
    };
    setTasks((current) => [retried, ...current]);
  }, []);

  const remove = useCallback((taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const clearFinished = useCallback(() => {
    setTasks((current) => current.filter((task) => !isTerminal(task.status)));
  }, []);

  return { tasks, enqueue, cancel, retry, remove, clearFinished };
}
