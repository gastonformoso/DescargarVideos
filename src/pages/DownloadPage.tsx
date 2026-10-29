import { useEffect, useState } from "react";

import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Thumbnail } from "../components/Thumbnail";
import { VideoPreview } from "../components/VideoPreview";
import {
  audioQualityLabel,
  formatBytes,
  formatRelative,
  qualityLabel,
} from "../lib/format";
import {
  analyzeVideo,
  isDemoMode,
  selectDirectory,
} from "../lib/tauri";
import { validateVideoUrl } from "../lib/validation";
import type {
  ContentType,
  DownloadDraft,
  DownloadTask,
  DuplicatePolicy,
  Page,
  Settings,
  ToolStatuses,
  VideoInfo,
} from "../types";

const VIDEO_FORMATS = [
  { value: "mp4", label: "MP4 · compatible" },
  { value: "mkv", label: "MKV · máxima compatibilidad" },
];

const AUDIO_FORMATS = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "opus", label: "OPUS" },
  { value: "wav", label: "WAV" },
];

const AUDIO_QUALITIES = [
  { value: "best", label: "Mejor calidad" },
  { value: "320", label: "320 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "128", label: "128 kbps" },
];

const POLICIES: Array<{ value: DuplicatePolicy; label: string; hint: string }> = [
  { value: "rename", label: "Renombrar", hint: "Añade un número al nombre" },
  { value: "overwrite", label: "Sobrescribir", hint: "Reemplaza el archivo existente" },
  { value: "skip", label: "Omitir", hint: "Conserva el archivo actual" },
];

interface DownloadPageProps {
  settings: Settings;
  tools: ToolStatuses | null;
  recentTasks: DownloadTask[];
  onEnqueue: (draft: DownloadDraft) => void;
  onNavigate: (page: Page) => void;
  onError: (title: string, message?: string) => void;
}

function pickVideoQuality(info: VideoInfo | null, preferred: string): string {
  if (info?.qualities.some((option) => String(option.height) === preferred)) {
    return preferred;
  }
  return "best";
}

function recentLabel(task: DownloadTask): string {
  if (task.status === "downloading") return `${Math.round(task.percent)}%`;
  if (task.status === "queued") return "En cola";
  if (task.status === "starting") return "Iniciando";
  if (task.status === "processing") return "Procesando";
  if (task.status === "completed") return "Completada";
  if (task.status === "failed") return "Fallida";
  return "Cancelada";
}

export function DownloadPage({
  settings,
  tools,
  recentTasks,
  onEnqueue,
  onNavigate,
  onError,
}: DownloadPageProps) {
  const [url, setUrl] = useState("");
  const [analyzedUrl, setAnalyzedUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [contentType, setContentType] = useState<ContentType>(settings.defaultContentType);
  const [quality, setQuality] = useState(
    settings.defaultContentType === "audio" ? settings.defaultAudioQuality : settings.defaultQuality,
  );
  const [format, setFormat] = useState(
    settings.defaultContentType === "audio" ? settings.defaultAudioFormat : settings.defaultVideoFormat,
  );
  const [filename, setFilename] = useState("");
  const [destination, setDestination] = useState(settings.defaultDirectory);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>(
    settings.duplicatePolicy,
  );

  useEffect(() => {
    if (!destination && settings.defaultDirectory) {
      setDestination(settings.defaultDirectory);
    }
  }, [destination, settings.defaultDirectory]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError(null);
    if (info) {
      setInfo(null);
      setAnalyzedUrl(null);
      setFilename("");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        handleUrlChange(text.trim());
      }
    } catch {
      setError("No se pudo leer el portapapeles. Pega el enlace manualmente.");
    }
  };

  const handleAnalyze = async () => {
    const problem = validateVideoUrl(url);
    if (problem) {
      setError(problem);
      return;
    }

    const target = url.trim();
    setAnalyzing(true);
    setError(null);
    setInfo(null);
    setAnalyzedUrl(null);

    try {
      const result = await analyzeVideo(target);
      setInfo(result);
      setAnalyzedUrl(target);
      setFilename("");

      const nextType = settings.defaultContentType;
      setContentType(nextType);
      if (nextType === "audio") {
        setQuality(settings.defaultAudioQuality);
        setFormat(
          AUDIO_FORMATS.some((option) => option.value === settings.defaultAudioFormat)
            ? settings.defaultAudioFormat
            : "mp3",
        );
      } else {
        setQuality(pickVideoQuality(result, settings.defaultQuality));
        setFormat(
          VIDEO_FORMATS.some((option) => option.value === settings.defaultVideoFormat)
            ? settings.defaultVideoFormat
            : "mp4",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTypeChange = (nextType: ContentType) => {
    setContentType(nextType);
    if (nextType === "audio") {
      setQuality(settings.defaultAudioQuality);
      setFormat(
        AUDIO_FORMATS.some((option) => option.value === settings.defaultAudioFormat)
          ? settings.defaultAudioFormat
          : "mp3",
      );
    } else {
      setQuality(pickVideoQuality(info, settings.defaultQuality));
      setFormat(
        VIDEO_FORMATS.some((option) => option.value === settings.defaultVideoFormat)
          ? settings.defaultVideoFormat
          : "mp4",
      );
    }
  };

  const handleChooseFolder = async () => {
    try {
      const selected = await selectDirectory(destination || settings.defaultDirectory);
      if (selected) {
        setDestination(selected);
        setError(null);
      }
    } catch (caught) {
      onError(
        "No se pudo abrir el selector de carpetas",
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const handleDownload = () => {
    const problem = validateVideoUrl(url);
    if (problem) {
      setError(problem);
      return;
    }
    if (!info || analyzedUrl !== url.trim()) {
      setError("Analiza el enlace antes de iniciar la descarga.");
      return;
    }
    if (!destination.trim()) {
      setError("Selecciona una carpeta de destino.");
      return;
    }
    if (tools && !tools.ytDlp.found) {
      onError(
        "Falta el motor de descargas",
        "yt-dlp no está instalado. Revisa la configuración de herramientas.",
      );
      onNavigate("settings");
      return;
    }

    setError(null);
    onEnqueue({
      url: analyzedUrl ?? url.trim(),
      title: info.title,
      platform: info.platform,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      contentType,
      quality,
      format,
      destination: destination.trim(),
      filename: filename.trim() || info.title,
      duplicatePolicy,
    });
    onNavigate("queue");
  };

  const qualityOptions =
    contentType === "video"
      ? [
          { value: "best", label: "Mejor disponible" },
          ...(info?.qualities ?? []).map((option) => ({
            value: String(option.height),
            label: `${option.label}${option.fps ? ` · ${Math.round(option.fps)} fps` : ""}${
              option.approxSize != null ? ` · ~${formatBytes(option.approxSize, 0)}` : ""
            }`,
          })),
        ]
      : AUDIO_QUALITIES;

  const currentFormats = contentType === "video" ? VIDEO_FORMATS : AUDIO_FORMATS;
  const summary = info
    ? `${info.platform} · ${
        contentType === "video" ? qualityLabel(quality, info) : audioQualityLabel(quality)
      } · ${format.toUpperCase()}`
    : "Selecciona un enlace y analízalo para empezar";

  const canStart =
    Boolean(info) && !analyzing && url.trim() === analyzedUrl && destination.trim().length > 0;

  return (
    <div className="download-grid">
      <div className="download-main">
        <section className="hero">
          <span className="hero-kicker">
            <Icon name="sparkles" size={14} /> Descargas sin rodeos
          </span>
          <h2>
            Tus videos favoritos,{" "}
            <span className="gradient-text">guardados en tu equipo.</span>
          </h2>
          <p>
            Pega un enlace de YouTube, TikTok o X, revisa los formatos disponibles y elige
            exactamente cómo quieres guardarlo.
          </p>
          <div className="platform-chips">
            <span className="platform-pill tone-youtube">YouTube</span>
            <span className="platform-pill tone-tiktok">TikTok</span>
            <span className="platform-pill tone-x">X (Twitter)</span>
          </div>
        </section>

        {isDemoMode && (
          <div className="banner banner-info">
            <Icon name="info" size={18} />
            <div>
              <strong>Modo demostración web</strong>
              <p>Las descargas son simuladas. Ejecuta la app con Tauri para usar yt-dlp real.</p>
            </div>
          </div>
        )}

        {tools && !tools.ytDlp.found && (
          <div className="banner banner-warning">
            <Icon name="alert" size={18} />
            <div>
              <strong>yt-dlp no está instalado</strong>
              <p>La app no puede analizar ni descargar videos hasta que configures el motor.</p>
            </div>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => onNavigate("settings")}
            >
              Configurar
            </button>
          </div>
        )}

        {tools?.ytDlp.found && !tools.ffmpeg.found && (
          <div className="banner banner-info">
            <Icon name="info" size={18} />
            <div>
              <strong>FFmpeg no está disponible</strong>
              <p>Podrás descargar archivos simples, pero no unir audio y video ni convertir formatos.</p>
            </div>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => onNavigate("settings")}
            >
              Revisar
            </button>
          </div>
        )}

        <section className="analyzer-card surface">
          <div className="card-heading">
            <span className="icon-bubble">
              <Icon name="link" size={19} />
            </span>
            <div>
              <h3>Enlace del video</h3>
              <p>Compatible con YouTube, TikTok y X (Twitter).</p>
            </div>
          </div>

          <div className={`input-row${error ? " has-error" : ""}`}>
            <span className="input-leading">
              <Icon name="link" size={18} />
            </span>
            <input
              type="url"
              value={url}
              onChange={(event) => handleUrlChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleAnalyze();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              spellCheck={false}
              autoComplete="off"
              aria-label="Enlace del video"
            />
            <button
              type="button"
              className="button button-ghost paste-button"
              onClick={() => void handlePaste()}
              title="Pegar desde el portapapeles"
            >
              <Icon name="clipboard" size={16} />
              <span>Pegar</span>
            </button>
            <button
              type="button"
              className="button button-primary analyze-button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing || !url.trim()}
            >
              <Icon name={analyzing ? "loader" : "sparkles"} size={17} className={analyzing ? "spin" : undefined} />
              {analyzing ? "Analizando" : "Analizar"}
            </button>
          </div>

          {error && (
            <div className="inline-error" role="alert">
              <Icon name="alertCircle" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="analyzer-foot">
            <span>
              <Icon name="shield" size={14} /> Enlaces validados antes de procesarse
            </span>
            <span>Sin servidores externos</span>
          </div>
        </section>

        {info ? (
          <VideoPreview
            info={info}
            onClear={() => {
              setInfo(null);
              setAnalyzedUrl(null);
              setFilename("");
            }}
          />
        ) : (
          <section className="preview-placeholder surface">
            <div className="preview-placeholder-art">
              <Icon name="play" size={30} />
            </div>
            <div>
              <h3>La vista previa aparecerá aquí</h3>
              <p>Analiza un enlace para ver el título, la miniatura y las calidades reales disponibles.</p>
            </div>
            <div className="preview-steps">
              <span><b>01</b> Pega el enlace</span>
              <span><b>02</b> Analiza</span>
              <span><b>03</b> Elige y descarga</span>
            </div>
          </section>
        )}

        <section className="options-card surface">
          <div className="card-heading">
            <span className="icon-bubble">
              <Icon name="settings" size={19} />
            </span>
            <div>
              <h3>Opciones de descarga</h3>
              <p>Ajusta la calidad, el formato y el destino del archivo.</p>
            </div>
          </div>

          <div className="type-toggle" role="group" aria-label="Tipo de contenido">
            <button
              type="button"
              className={contentType === "video" ? "is-active" : ""}
              onClick={() => handleTypeChange("video")}
            >
              <Icon name="play" size={16} /> Video con audio
            </button>
            <button
              type="button"
              className={contentType === "audio" ? "is-active" : ""}
              onClick={() => handleTypeChange("audio")}
            >
              <Icon name="music" size={16} /> Solo audio
            </button>
          </div>

          <div className="option-grid">
            <label className="field">
              <span>{contentType === "video" ? "Calidad de video" : "Calidad de audio"}</span>
              <div className="select-wrap">
                <select
                  value={quality}
                  onChange={(event) => setQuality(event.target.value)}
                  disabled={!info}
                >
                  {qualityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>

            <label className="field">
              <span>Formato de salida</span>
              <div className="select-wrap">
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                  disabled={!info}
                >
                  {currentFormats.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>

            <label className="field field-wide">
              <span>Nombre del archivo</span>
              <div className="input-shell">
                <Icon name="file" size={16} />
                <input
                  type="text"
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder={info?.title ?? "Se usará el título del video"}
                  spellCheck={false}
                />
                <span className="input-suffix">.{format}</span>
              </div>
              <small>Se ajustarán automáticamente los caracteres no válidos.</small>
            </label>

            <label className="field field-wide">
              <span>Carpeta de destino</span>
              <div className="input-shell">
                <Icon name="folder" size={16} />
                <input
                  type="text"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Selecciona una carpeta"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={() => void handleChooseFolder()}
                >
                  <Icon name="folderOpen" size={15} /> Elegir
                </button>
              </div>
            </label>

            <div className="field field-wide">
              <span>Si el archivo ya existe</span>
              <div className="policy-row">
                {POLICIES.map((policy) => (
                  <button
                    key={policy.value}
                    type="button"
                    className={`policy-chip${duplicatePolicy === policy.value ? " is-active" : ""}`}
                    onClick={() => setDuplicatePolicy(policy.value)}
                    aria-pressed={duplicatePolicy === policy.value}
                    title={policy.hint}
                  >
                    {policy.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {contentType === "audio" && tools && !tools.ffmpeg.found && (
            <p className="form-hint is-warning">
              <Icon name="alert" size={14} /> La extracción y conversión de audio necesita FFmpeg.
            </p>
          )}

          <div className="download-actions">
            <div className="download-summary">
              <span className="summary-icon">
                <Icon name={contentType === "video" ? "download" : "music"} size={17} />
              </span>
              <div>
                <strong>{info ? "Listo para descargar" : "Aún no hay un video analizado"}</strong>
                <span>{summary}</span>
              </div>
            </div>
            <button
              type="button"
              className="button button-primary button-lg"
              onClick={handleDownload}
              disabled={!canStart}
            >
              <Icon name="download" size={18} /> Descargar ahora
            </button>
          </div>
        </section>
      </div>

      <aside className="recent-panel">
        <div className="panel-head">
          <div>
            <h3>Descargas recientes</h3>
            <p>Tu actividad más reciente.</p>
          </div>
          <button type="button" className="link-button" onClick={() => onNavigate("queue")}>
            Ver cola <Icon name="arrowRight" size={14} />
          </button>
        </div>

        {recentTasks.length === 0 ? (
          <EmptyState
            icon="queue"
            title="Todo despejado"
            description="Cuando inicies una descarga aparecerá aquí con su progreso."
          />
        ) : (
          <div className="recent-list">
            {recentTasks.slice(0, 4).map((task) => (
              <button
                key={task.id}
                type="button"
                className="recent-item"
                onClick={() => onNavigate("queue")}
                title={task.title}
              >
                <Thumbnail
                  src={task.thumbnail}
                  title={task.title}
                  platform={task.platform}
                  className="recent-thumb"
                />
                <span className="recent-info">
                  <strong>{task.title}</strong>
                  <span>
                    {task.platform} · {formatRelative(task.createdAt)}
                  </span>
                </span>
                <span className={`recent-status status-${task.status}`}>
                  {recentLabel(task)}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="panel-foot">
          <div className="panel-stat">
            <span>En cola</span>
            <strong>{recentTasks.filter((task) => task.status === "queued").length}</strong>
          </div>
          <div className="panel-stat">
            <span>Activas</span>
            <strong>
              {recentTasks.filter((task) =>
                ["starting", "downloading", "processing"].includes(task.status),
              ).length}
            </strong>
          </div>
          <div className="panel-stat">
            <span>Completadas</span>
            <strong>{recentTasks.filter((task) => task.status === "completed").length}</strong>
          </div>
        </div>
      </aside>
    </div>
  );
}
