interface ProgressBarProps {
  percent: number;
  tone?: "accent" | "success" | "danger" | "warning" | "muted";
  animated?: boolean;
}

export function ProgressBar({ percent, tone = "accent", animated = false }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div
      className={`progress-track tone-${tone}${animated ? " is-animated" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
