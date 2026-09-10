export interface NavigationControlsProps {
  canGoBack: boolean;
  canGoNext: boolean;
  isLastQuestion: boolean;
  allowFlag: boolean;
  flagged: boolean;
  onBack: () => void;
  onNext: () => void;
  onToggleFlag: () => void;
  disableNextUntilAnswered: boolean;
  hasAnswer: boolean;
}

export function NavigationControls({
  canGoBack,
  canGoNext,
  isLastQuestion,
  allowFlag,
  flagged,
  onBack,
  onNext,
  onToggleFlag,
  disableNextUntilAnswered,
  hasAnswer,
}: NavigationControlsProps) {
  const nextDisabled = disableNextUntilAnswered && !hasAnswer;
  return (
    <div className="sq-nav-controls">
      {allowFlag && (
        <button type="button" onClick={onToggleFlag} aria-pressed={flagged} className="sq-flag-button">
          {flagged ? "Unflag for review" : "Flag for review"}
        </button>
      )}
      <div className="sq-nav-buttons">
        <button type="button" onClick={onBack} disabled={!canGoBack} className="sq-nav-back">
          Previous
        </button>
        <button type="button" onClick={onNext} disabled={!canGoNext || nextDisabled} className="sq-nav-next">
          {isLastQuestion ? "Review & Submit" : "Next"}
        </button>
      </div>
      {nextDisabled && (
        <p role="alert" className="sq-nav-warning">
          Please answer this question before continuing.
        </p>
      )}
    </div>
  );
}
