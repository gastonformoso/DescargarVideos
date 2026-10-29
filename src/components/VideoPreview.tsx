import { formatBytes, formatDuration, platformTone } from "../lib/format";
import type { VideoInfo } from "../types";
import { Icon } from "./Icon";
import { Thumbnail } from "./Thumbnail";

interface VideoPreviewProps {
  info: VideoInfo;
  onClear: () => void;
}

export function VideoPreview({ info, onClear }: VideoPreviewProps) {
  const tone = platformTone(info.platform);
  const audioSummary = info.audioOptions
    .slice(0, 2)
    .map((option) => `${option.abr} kbps ${option.ext.toUpperCase()}`)
    .join(" · ");

  return (
    <section className="video-card surface" aria-label="Vista previa del video">
      <Thumbnail
        src={info.thumbnail}
        title={info.title}
        platform={info.platform}
        className="video-thumb"
        badge={
          info.duration != null ? (
            <span className="thumb-badge">{formatDuration(info.duration)}</span>
          ) : undefined
        }
      />
      <div className="video-body">
        <div className="video-topline">
          <span className={`platform-badge tone-${tone}`}>{info.platform}</span>
          {info.uploader && <span className="video-uploader">{info.uploader}</span>}
          <button
            type="button"
            className="icon-button video-clear"
            onClick={onClear}
            title="Quitar vista previa"
            aria-label="Quitar vista previa"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <h2 className="video-title" title={info.title}>
          {info.title}
        </h2>
        <div className="video-meta">
          <span>
            <Icon name="clock" size={14} /> {formatDuration(info.duration)}
          </span>
          <span>
            <Icon name="monitor" size={14} /> {info.qualities.length} calidades
          </span>
          {audioSummary && (
            <span>
              <Icon name="music" size={14} /> {audioSummary}
            </span>
          )}
        </div>
        <div className="quality-chips">
          {info.qualities.slice(0, 5).map((option) => (
            <span key={option.height} className="quality-chip">
              {option.label}
              {option.approxSize != null && (
                <em>~{formatBytes(option.approxSize, 0)}</em>
              )}
            </span>
          ))}
          {info.qualities.length === 0 && (
            <span className="quality-chip is-muted">Calidades no disponibles</span>
          )}
        </div>
      </div>
    </section>
  );
}
