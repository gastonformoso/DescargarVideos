export type Page = "download" | "queue" | "history" | "settings";

export type ContentType = "video" | "audio";
export type DuplicatePolicy = "rename" | "overwrite" | "skip";
export type Accent = "violet" | "cyan" | "emerald" | "rose";

export type DownloadStatus =
  | "queued"
  | "starting"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface QualityOption {
  height: number;
  label: string;
  approxSize: number | null;
  fps: number | null;
}

export interface AudioOption {
  abr: number;
  ext: string;
  approxSize: number | null;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  platform: string;
  webpageUrl: string;
  qualities: QualityOption[];
  audioOptions: AudioOption[];
}

export interface ToolStatus {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface ToolStatuses {
  ytDlp: ToolStatus;
  ffmpeg: ToolStatus;
  ffprobe: ToolStatus;
}

export interface AppDefaults {
  downloadDir: string;
  tools: ToolStatuses;
  appVersion: string;
  platform: string;
}

export interface Settings {
  defaultDirectory: string;
  defaultContentType: ContentType;
  defaultQuality: string;
  defaultAudioQuality: string;
  defaultVideoFormat: string;
  defaultAudioFormat: string;
  duplicatePolicy: DuplicatePolicy;
  maxConcurrent: number;
  openFolderOnComplete: boolean;
  showNotifications: boolean;
  accent: Accent;
}

export interface DownloadDraft {
  url: string;
  title: string;
  platform: string;
  thumbnail: string | null;
  uploader: string | null;
  contentType: ContentType;
  quality: string;
  format: string;
  destination: string;
  filename: string;
  duplicatePolicy: DuplicatePolicy;
}

export interface DownloadRequestPayload {
  taskId: string;
  url: string;
  title: string;
  contentType: ContentType;
  quality: string;
  format: string;
  destination: string;
  filename: string;
  duplicatePolicy: DuplicatePolicy;
}

export interface DownloadTask extends DownloadDraft {
  id: string;
  status: DownloadStatus;
  percent: number;
  downloaded: number | null;
  total: number | null;
  speed: number | null;
  eta: number | null;
  filePath: string | null;
  error: string | null;
  message: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface DownloadEventPayload {
  taskId: string;
  status: DownloadStatus;
  percent?: number;
  downloaded?: number;
  total?: number;
  speed?: number;
  eta?: number;
  filePath?: string;
  error?: string;
  message?: string;
}

export interface HistoryRecord {
  id: string;
  url: string;
  title: string;
  platform: string;
  thumbnail: string | null;
  contentType: ContentType;
  quality: string;
  format: string;
  directory: string;
  fileName: string;
  filePath: string | null;
  status: Extract<DownloadStatus, "completed" | "failed" | "cancelled">;
  message: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number;
}

export interface Toast {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}
