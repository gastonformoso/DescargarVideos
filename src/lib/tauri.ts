import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  AppDefaults,
  DownloadEventPayload,
  DownloadRequestPayload,
  ToolStatuses,
  VideoInfo,
} from "../types";

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const isDemoMode = !isTauriEnvironment();

const demoHandlers = new Set<(payload: DownloadEventPayload) => void>();
const demoTimers = new Map<string, number>();
const demoTimeouts = new Map<string, number>();
const demoCancelled = new Set<string>();

const demoTools: ToolStatuses = {
  ytDlp: { found: true, path: "Modo demostración", version: "demo" },
  ffmpeg: { found: true, path: "Modo demostración", version: "demo" },
  ffprobe: { found: true, path: "Modo demostración", version: "demo" },
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function emitDemo(payload: DownloadEventPayload) {
  demoHandlers.forEach((handler) => handler(payload));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function demoThumbnail(title: string, from: string, to: string, label: string): string {
  const shortTitle = title.length > 58 ? `${title.slice(0, 57)}…` : title;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
      <radialGradient id="v" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stop-color="rgba(255,255,255,.24)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <rect width="1280" height="720" fill="url(#v)"/>
    <circle cx="640" cy="290" r="84" fill="rgba(5,8,14,.4)" stroke="rgba(255,255,255,.7)" stroke-width="6"/>
    <path d="M622 250 L694 290 L622 330 Z" fill="#fff"/>
    <text x="80" y="560" fill="rgba(255,255,255,.95)" font-family="Segoe UI, sans-serif" font-size="46" font-weight="700">${escapeXml(shortTitle)}</text>
    <text x="80" y="620" fill="rgba(255,255,255,.75)" font-family="Segoe UI, sans-serif" font-size="28" letter-spacing="6">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function demoPlatform(url: string): { platform: string; from: string; to: string } {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("tiktok")) {
    return { platform: "TikTok", from: "#0f172a", to: "#fe2c55" };
  }
  if (host.includes("twitter") || host === "x.com" || host.endsWith(".x.com")) {
    return { platform: "X (Twitter)", from: "#0f172a", to: "#1d9bf0" };
  }
  return { platform: "YouTube", from: "#15102b", to: "#7c3aed" };
}

export async function getDefaults(): Promise<AppDefaults> {
  if (!isTauriEnvironment()) {
    return {
      downloadDir: "C:\\Users\\Invitado\\Downloads",
      tools: demoTools,
      appVersion: "0.1.0",
      platform: "windows",
    };
  }
  return invoke<AppDefaults>("get_defaults");
}

export async function checkTools(): Promise<ToolStatuses> {
  if (!isTauriEnvironment()) return demoTools;
  return invoke<ToolStatuses>("check_tools");
}

export async function updateYtDlp(): Promise<ToolStatuses> {
  if (!isTauriEnvironment()) {
    await delay(1200);
    return demoTools;
  }
  return invoke<ToolStatuses>("update_yt_dlp");
}

export async function analyzeVideo(url: string): Promise<VideoInfo> {
  if (!isTauriEnvironment()) {
    await delay(1000);
    const { platform, from, to } = demoPlatform(url);
    if (url.toLowerCase().includes("no-disponible")) {
      throw new Error("El video no está disponible o requiere iniciar sesión.");
    }
    const title =
      platform === "TikTok"
        ? "Ideas rápidas para organizar tu escritorio"
        : platform === "X (Twitter)"
          ? "Hilo: cómo diseñar una aplicación de escritorio moderna"
          : "Cómo crear una app de escritorio con React y Tauri";
    return {
      id: "demo-video",
      title,
      thumbnail: demoThumbnail(
        title,
        from,
        to,
        `DEMO · ${platform.toUpperCase()}`,
      ),
      duration: 742,
      uploader: "Estudio Local",
      platform,
      webpageUrl: url,
      qualities: [
        { height: 2160, label: "2160p (4K)", approxSize: 812_000_000, fps: 60 },
        { height: 1440, label: "1440p (2K)", approxSize: 398_000_000, fps: 60 },
        { height: 1080, label: "1080p (Full HD)", approxSize: 184_000_000, fps: 60 },
        { height: 720, label: "720p (HD)", approxSize: 92_000_000, fps: 30 },
        { height: 480, label: "480p", approxSize: 48_000_000, fps: 30 },
        { height: 360, label: "360p", approxSize: 24_000_000, fps: 30 },
      ],
      audioOptions: [
        { abr: 160, ext: "m4a", approxSize: 14_800_000 },
        { abr: 128, ext: "m4a", approxSize: 11_900_000 },
      ],
    };
  }
  return invoke<VideoInfo>("analyze_video", { url });
}

export async function startDownload(request: DownloadRequestPayload): Promise<void> {
  if (!isTauriEnvironment()) {
    const total = 42_000_000 + Math.round(Math.random() * 30_000_000);
    let downloaded = 0;
    const startedAt = Date.now();

    emitDemo({
      taskId: request.taskId,
      status: "starting",
      message: "Preparando la descarga de demostración...",
    });

    await delay(400);
    if (demoCancelled.has(request.taskId)) return;

    const interval = window.setInterval(() => {
      if (demoCancelled.has(request.taskId)) return;

      const chunk = Math.max(320_000, Math.round(total * (0.012 + Math.random() * 0.018)));
      downloaded = Math.min(total, downloaded + chunk);
      const elapsed = Math.max(0.2, (Date.now() - startedAt) / 1000);
      emitDemo({
        taskId: request.taskId,
        status: "downloading",
        percent: Math.min(100, (downloaded / total) * 100),
        downloaded,
        total,
        speed: downloaded / elapsed,
        eta: Math.max(0, Math.round((total - downloaded) / Math.max(1, downloaded / elapsed))),
      });

      if (downloaded >= total) {
        window.clearInterval(interval);
        demoTimers.delete(request.taskId);
        emitDemo({
          taskId: request.taskId,
          status: "processing",
          percent: 100,
          downloaded: total,
          total,
          message: "Procesando el archivo de demostración...",
        });
        const timeout = window.setTimeout(() => {
          demoTimeouts.delete(request.taskId);
          if (demoCancelled.has(request.taskId)) return;
          const extension = request.format === "best" ? "mp4" : request.format;
          const fileName = request.filename.trim() || request.title;
          emitDemo({
            taskId: request.taskId,
            status: "completed",
            percent: 100,
            filePath: `${request.destination}\\${fileName}.${extension}`,
          });
        }, 1000);
        demoTimeouts.set(request.taskId, timeout);
      }
    }, 220);

    demoTimers.set(request.taskId, interval);
    return;
  }

  await invoke("start_download", { request });
}

export async function cancelDownload(taskId: string): Promise<void> {
  if (!isTauriEnvironment()) {
    demoCancelled.add(taskId);
    const interval = demoTimers.get(taskId);
    if (interval != null) window.clearInterval(interval);
    demoTimers.delete(taskId);
    const timeout = demoTimeouts.get(taskId);
    if (timeout != null) window.clearTimeout(timeout);
    demoTimeouts.delete(taskId);
    emitDemo({
      taskId,
      status: "cancelled",
      message: "Descarga cancelada por el usuario.",
    });
    return;
  }
  await invoke("cancel_download", { taskId });
}

export function onDownloadEvent(
  handler: (payload: DownloadEventPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriEnvironment()) {
    demoHandlers.add(handler);
    return Promise.resolve(() => {
      demoHandlers.delete(handler);
    });
  }
  return listen<DownloadEventPayload>("download:event", (event) => handler(event.payload));
}

export async function selectDirectory(defaultPath?: string): Promise<string | null> {
  if (!isTauriEnvironment()) {
    return defaultPath ?? "C:\\Users\\Invitado\\Downloads";
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Selecciona la carpeta de destino",
    defaultPath: defaultPath || undefined,
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected ?? null;
}

export async function openFile(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke("open_file", { path });
}

export async function openFolder(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke("open_folder", { path });
}

export async function revealPath(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke("reveal_path", { path });
}
