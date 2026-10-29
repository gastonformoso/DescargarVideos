import { useState } from "react";

import { Icon } from "../components/Icon";
import { Toggle } from "../components/Toggle";
import { selectDirectory } from "../lib/tauri";
import type {
  Accent,
  DuplicatePolicy,
  Settings,
  ToolStatus,
  ToolStatuses,
} from "../types";

const VIDEO_QUALITIES = [
  { value: "best", label: "Mejor disponible" },
  { value: "2160", label: "2160p (4K)" },
  { value: "1440", label: "1440p (2K)" },
  { value: "1080", label: "1080p (Full HD)" },
  { value: "720", label: "720p (HD)" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

const AUDIO_QUALITIES = [
  { value: "best", label: "Mejor calidad" },
  { value: "320", label: "320 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "128", label: "128 kbps" },
];

const ACCENTS: Array<{ value: Accent; label: string }> = [
  { value: "violet", label: "Violeta" },
  { value: "cyan", label: "Cian" },
  { value: "emerald", label: "Esmeralda" },
  { value: "rose", label: "Rosa" },
];

const POLICIES: Array<{ value: DuplicatePolicy; label: string }> = [
  { value: "rename", label: "Renombrar" },
  { value: "overwrite", label: "Sobrescribir" },
  { value: "skip", label: "Omitir" },
];

interface SettingsPageProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  tools: ToolStatuses | null;
  appVersion: string;
  demo: boolean;
  updatingTools: boolean;
  onRefreshTools: () => void;
  onUpdateTools: () => void;
  onError: (title: string, message?: string) => void;
}

function ToolRow({
  name,
  description,
  status,
  required,
}: {
  name: string;
  description: string;
  status: ToolStatus | undefined;
  required?: boolean;
}) {
  const found = Boolean(status?.found);
  return (
    <div className="tool-row">
      <span className={`tool-icon${found ? " is-found" : ""}`}>
        <Icon name={found ? "check" : "alert"} size={16} />
      </span>
      <div className="tool-info">
        <div className="tool-name">
          <strong>{name}</strong>
          {required && <span className="tool-tag">Requerido</span>}
          <span className={`tool-state${found ? " is-found" : ""}`}>
            {status == null ? "Comprobando…" : found ? "Detectado" : "No encontrado"}
          </span>
        </div>
        <p>{description}</p>
        {found && (status?.version || status?.path) && (
          <span className="tool-detail" title={status?.path ?? undefined}>
            {status.version ?? status.path}
          </span>
        )}
      </div>
    </div>
  );
}

export function SettingsPage({
  settings,
  onChange,
  tools,
  appVersion,
  demo,
  updatingTools,
  onRefreshTools,
  onUpdateTools,
  onError,
}: SettingsPageProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleChooseFolder = async () => {
    try {
      const selected = await selectDirectory(settings.defaultDirectory);
      if (selected) onChange({ defaultDirectory: selected });
    } catch (error) {
      onError(
        "No se pudo abrir el selector de carpetas",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <div className="settings-grid">
      <section className="surface settings-card">
        <div className="settings-heading">
          <span className="icon-bubble">
            <Icon name="download" size={18} />
          </span>
          <div>
            <h2>Descargas predeterminadas</h2>
            <p>Estos valores se aplican a cada nueva descarga.</p>
          </div>
        </div>

        <div className="settings-fields">
          <label className="field">
            <span>Carpeta predeterminada</span>
            <div className="input-shell">
              <Icon name="folder" size={16} />
              <input
                type="text"
                value={settings.defaultDirectory}
                onChange={(event) => onChange({ defaultDirectory: event.target.value })}
                placeholder="C:\\Users\\TuUsuario\\Downloads"
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

          <div className="field">
            <span>Tipo de contenido preferido</span>
            <div className="type-toggle compact">
              <button
                type="button"
                className={settings.defaultContentType === "video" ? "is-active" : ""}
                onClick={() => onChange({ defaultContentType: "video" })}
              >
                <Icon name="play" size={15} /> Video
              </button>
              <button
                type="button"
                className={settings.defaultContentType === "audio" ? "is-active" : ""}
                onClick={() => onChange({ defaultContentType: "audio" })}
              >
                <Icon name="music" size={15} /> Audio
              </button>
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Calidad de video</span>
              <div className="select-wrap">
                <select
                  value={settings.defaultQuality}
                  onChange={(event) => onChange({ defaultQuality: event.target.value })}
                >
                  {VIDEO_QUALITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>
            <label className="field">
              <span>Formato de video</span>
              <div className="select-wrap">
                <select
                  value={settings.defaultVideoFormat}
                  onChange={(event) => onChange({ defaultVideoFormat: event.target.value })}
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Calidad de audio</span>
              <div className="select-wrap">
                <select
                  value={settings.defaultAudioQuality}
                  onChange={(event) => onChange({ defaultAudioQuality: event.target.value })}
                >
                  {AUDIO_QUALITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>
            <label className="field">
              <span>Formato de audio</span>
              <div className="select-wrap">
                <select
                  value={settings.defaultAudioFormat}
                  onChange={(event) => onChange({ defaultAudioFormat: event.target.value })}
                >
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">OPUS</option>
                  <option value="wav">WAV</option>
                </select>
                <Icon name="chevronDown" size={15} />
              </div>
            </label>
          </div>

          <div className="field">
            <span>Si el archivo ya existe</span>
            <div className="policy-row">
              {POLICIES.map((policy) => (
                <button
                  key={policy.value}
                  type="button"
                  className={`policy-chip${settings.duplicatePolicy === policy.value ? " is-active" : ""}`}
                  onClick={() => onChange({ duplicatePolicy: policy.value })}
                  aria-pressed={settings.duplicatePolicy === policy.value}
                >
                  {policy.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Descargas simultáneas</span>
            <div className="segmented-values">
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={settings.maxConcurrent === value ? "is-active" : ""}
                  onClick={() => onChange({ maxConcurrent: value })}
                >
                  {value}
                </button>
              ))}
            </div>
            <small>Más descargas a la vez consumen más ancho de banda y recursos.</small>
          </div>
        </div>
      </section>

      <section className="surface settings-card">
        <div className="settings-heading">
          <span className="icon-bubble">
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h2>Apariencia y avisos</h2>
            <p>Personaliza la interfaz y el comportamiento de la app.</p>
          </div>
        </div>

        <div className="settings-fields">
          <div className="field">
            <span>Color de acento</span>
            <div className="accent-row">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  className={`accent-swatch accent-${accent.value}${settings.accent === accent.value ? " is-active" : ""}`}
                  onClick={() => onChange({ accent: accent.value })}
                  aria-pressed={settings.accent === accent.value}
                  aria-label={accent.label}
                  title={accent.label}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>

          <div className="setting-toggle-row">
            <div>
              <strong>Abrir la carpeta al completar</strong>
              <p>Abre el explorador cuando una descarga termine correctamente.</p>
            </div>
            <Toggle
              checked={settings.openFolderOnComplete}
              onChange={(value) => onChange({ openFolderOnComplete: value })}
              label="Abrir la carpeta al completar"
            />
          </div>

          <div className="setting-toggle-row">
            <div>
              <strong>Mostrar notificaciones</strong>
              <p>Avisos dentro de la app al completar o fallar una descarga.</p>
            </div>
            <Toggle
              checked={settings.showNotifications}
              onChange={(value) => onChange({ showNotifications: value })}
              label="Mostrar notificaciones"
            />
          </div>

          <div className="settings-note">
            <Icon name="shield" size={16} />
            <p>
              Todo se procesa en tu equipo. No se envían enlaces, archivos ni preferencias a
              servidores externos.
            </p>
          </div>
        </div>
      </section>

      <section className="surface settings-card settings-wide">
        <div className="settings-heading">
          <span className="icon-bubble">
            <Icon name="terminal" size={18} />
          </span>
          <div>
            <h2>Motor y herramientas</h2>
            <p>yt-dlp analiza y descarga; FFmpeg une y convierte los archivos.</p>
          </div>
          <div className="settings-heading-actions">
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={onRefreshTools}
            >
              <Icon name="refresh" size={15} /> Comprobar
            </button>
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={onUpdateTools}
              disabled={updatingTools || !tools?.ytDlp.found}
            >
              <Icon
                name={updatingTools ? "loader" : "rotate"}
                size={15}
                className={updatingTools ? "spin" : undefined}
              />
              {updatingTools ? "Actualizando…" : "Actualizar yt-dlp"}
            </button>
          </div>
        </div>

        <div className="tools-list">
          <ToolRow
            name="yt-dlp"
            description="Análisis de enlaces y motor de descargas."
            status={tools?.ytDlp}
            required
          />
          <ToolRow
            name="FFmpeg"
            description="Unión de audio y video, remux y conversión de formatos."
            status={tools?.ffmpeg}
          />
          <ToolRow
            name="FFprobe"
            description="Inspección de flujos multimedia usada por FFmpeg."
            status={tools?.ffprobe}
          />
        </div>

        {demo && (
          <div className="settings-note is-warning">
            <Icon name="info" size={16} />
            <p>
              Estás en la vista de demostración del navegador. Las herramientas y descargas son
              simuladas hasta ejecutar la aplicación con Tauri.
            </p>
          </div>
        )}

        <button
          type="button"
          className="details-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          <Icon name="chevronDown" size={15} className={advancedOpen ? "is-open" : undefined} />
          Cómo instalar o actualizar las herramientas
        </button>

        {advancedOpen && (
          <div className="tool-help">
            <p>
              En desarrollo, ejecuta <code>npm run tools</code> para descargar yt-dlp, FFmpeg y
              FFprobe en <code>src-tauri/resources/bin</code>. Esa carpeta se incluye al generar el
              instalador.
            </p>
            <p>
              También puedes colocar los ejecutables manualmente en esa carpeta o definir las
              variables de entorno <code>YTDLP_PATH</code> y <code>FFMPEG_PATH</code>.
            </p>
            <p>
              yt-dlp cambia con frecuencia. Si una plataforma deja de funcionar, usa “Actualizar
              yt-dlp” o descarga la última versión antes de volver a compilar.
            </p>
          </div>
        )}
      </section>

      <section className="surface settings-card settings-wide about-card">
        <div className="settings-heading">
          <span className="icon-bubble">
            <Icon name="monitor" size={18} />
          </span>
          <div>
            <h2>Acerca de Video Downloader</h2>
            <p>Aplicación local para centralizar tus descargas.</p>
          </div>
        </div>
        <div className="about-grid">
          <div>
            <span>Versión</span>
            <strong>{appVersion || "0.1.0"}</strong>
          </div>
          <div>
            <span>Plataforma</span>
            <strong>Windows · Tauri</strong>
          </div>
          <div>
            <span>Almacenamiento</span>
            <strong>Local en este equipo</strong>
          </div>
          <div>
            <span>Distribución</span>
            <strong>Instalador NSIS</strong>
          </div>
        </div>
        <p className="about-legal">
          Descarga únicamente contenido que tengas derecho a usar. La aplicación no elude
          autenticaciones ni restricciones de acceso, y el soporte de cada plataforma puede cambiar
          con el tiempo. Respeta los derechos de autor y las condiciones de uso de cada sitio.
        </p>
      </section>
    </div>
  );
}
