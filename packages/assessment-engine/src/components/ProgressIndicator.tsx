export interface ProgressIndicatorProps {
  currentIndex: number;
  total: number;
}

export function ProgressIndicator({ currentIndex, total }: ProgressIndicatorProps) {
  const current = currentIndex + 1;
  return (
    <div className="sq-progress" role="status" aria-live="polite">
      <div className="sq-progress-track" aria-hidden="true">
        <div className="sq-progress-fill" style={{ width: `${(current / total) * 100}%` }} />
      </div>
      <span className="sq-progress-label">
        Question {current} of {total}
      </span>
    </div>
  );
}
