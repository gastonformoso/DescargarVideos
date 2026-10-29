import { useEffect, useState, type ReactNode } from "react";

import { platformShort, platformTone } from "../lib/format";
import { Icon } from "./Icon";

interface ThumbnailProps {
  src: string | null;
  title: string;
  platform: string;
  className?: string;
  badge?: ReactNode;
}

export function Thumbnail({ src, title, platform, className = "", badge }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const tone = platformTone(platform);

  return (
    <div className={`thumbnail ${className} tone-${tone}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={`Miniatura de ${title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="thumbnail-fallback">
          <span className="thumbnail-platform">{platformShort(platform)}</span>
          <Icon name={tone === "youtube" || tone === "tiktok" ? "play" : "image"} size={30} />
        </div>
      )}
      {badge}
    </div>
  );
}
