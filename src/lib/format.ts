import type { DownloadStatus, QualityOption, VideoInfo } from "../types";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${UNITS[index]}`;
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "—";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (minutes < 60) {
    return `${minutes} min ${remaining} s`;
  }
  return formatDuration(seconds);
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(
    new Date(timestamp),
  );
}

export function platformTone(platform: string): string {
  const value = platform.toLowerCase();
  if (value.includes("youtube")) return "youtube";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("x") || value.includes("twitter")) return "x";
  return "generic";
}

export function platformShort(platform: string): string {
  const tone = platformTone(platform);
  if (tone === "youtube") return "YT";
  if (tone === "tiktok") return "TT";
  if (tone === "x") return "X";
  return platform.slice(0, 2).toUpperCase();
}

export function qualityLabel(quality: string, info: VideoInfo | null): string {
  if (quality === "best") return "Mejor disponible";
  const match: QualityOption | undefined = info?.qualities.find(
    (option) => String(option.height) === quality,
  );
  return match?.label ?? `${quality}p`;
}

export function audioQualityLabel(quality: string): string {
  if (quality === "best") return "Mejor calidad";
  return `${quality} kbps`;
}

export function isTerminal(status: DownloadStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isActive(status: DownloadStatus): boolean {
  return (
    status === "queued" ||
    status === "starting" ||
    status === "downloading" ||
    status === "processing"
  );
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1))}…`;
}
