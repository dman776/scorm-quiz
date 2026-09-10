import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Assessment, AssessmentSettings } from "@scorm-quiz/schemas";
import { AssessmentSettingsSchema } from "@scorm-quiz/schemas";

export interface SettingsPanelProps {
  assessment: Assessment;
  onChange: (settings: AssessmentSettings) => void;
}

type Tab = "scoring" | "attempts" | "navigation" | "randomization" | "results" | "scorm";
const TABS: { id: Tab; label: string }[] = [
  { id: "scoring", label: "Scoring" },
  { id: "attempts", label: "Attempts" },
  { id: "navigation", label: "Navigation" },
  { id: "randomization", label: "Randomization" },
  { id: "results", label: "Results" },
  { id: "scorm", label: "SCORM (Advanced)" },
];

export function SettingsPanel({ assessment, onChange }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("scoring");
  const { register, handleSubmit } = useForm<AssessmentSettings>({
    resolver: zodResolver(AssessmentSettingsSchema),
    defaultValues: assessment.settings,
    // Applying on every change keeps this panel feeling like live settings
    // rather than a separate save step from the question editor.
    mode: "onChange",
  });

  const applyNow = handleSubmit((data) => onChange(AssessmentSettingsSchema.parse(data)));

  return (
    <div className="sq-panel sq-settings-panel">
      <h2>Assessment Settings</h2>
      <div role="tablist" aria-label="Settings categories" className="sq-settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "sq-tab-selected" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onChange={applyNow} onSubmit={(e) => e.preventDefault()} className="sq-settings-form">
        {tab === "scoring" && (
          <div role="tabpanel">
            <label htmlFor="passingScorePercent">Passing score (%)</label>
            <input id="passingScorePercent" type="number" min={0} max={100} {...register("scoring.passingScorePercent", { valueAsNumber: true })} />

            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("scoring.allowPartialCredit")} />
              Allow partial credit
            </label>

            <label htmlFor="rounding">Score rounding</label>
            <select id="rounding" {...register("scoring.rounding")}>
              <option value="none">None</option>
              <option value="nearestInteger">Nearest integer</option>
              <option value="twoDecimal">Two decimal places</option>
            </select>

            <label htmlFor="unansweredTreatment">Unanswered questions</label>
            <select id="unansweredTreatment" {...register("scoring.unansweredTreatment")}>
              <option value="incorrect">Treat as incorrect</option>
              <option value="excludeFromScoring">Exclude from scoring</option>
            </select>
          </div>
        )}

        {tab === "attempts" && (
          <div role="tabpanel">
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("attempts.unlimitedAttempts")} />
              Unlimited attempts
            </label>
            <label htmlFor="maxAttempts">Maximum attempts</label>
            <input id="maxAttempts" type="number" min={1} {...register("attempts.maxAttempts", { valueAsNumber: true })} />

            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("attempts.passingEndsAccess")} />
              Passing ends further access
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("attempts.allowAdditionalAttemptsAfterPassing")} />
              Allow additional attempts after passing
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("attempts.resetAnswersBetweenAttempts")} />
              Reset answers between attempts
            </label>

            <label htmlFor="scoreRetention">Score sent to LMS</label>
            <select id="scoreRetention" {...register("attempts.scoreRetention")}>
              <option value="highest">Highest attempt</option>
              <option value="latest">Latest attempt</option>
              <option value="first">First attempt</option>
            </select>
          </div>
        )}

        {tab === "navigation" && (
          <div role="tabpanel">
            <label htmlFor="navMode">Navigation mode</label>
            <select id="navMode" {...register("navigation.mode")}>
              <option value="onePerPage">One question per page</option>
              <option value="allOnOnePage">All questions on one page</option>
              <option value="sectionBySection">Section by section</option>
            </select>

            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("navigation.allowBackwardNavigation")} />
              Allow backward navigation
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("navigation.requireAnswerBeforeContinuing")} />
              Require an answer before continuing
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("navigation.allowFlagForReview")} />
              Allow flagging questions for review
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("navigation.showReviewScreenBeforeSubmit")} />
              Show review screen before submission
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("navigation.showProgressIndicator")} />
              Show progress indicator
            </label>
            <label htmlFor="timeLimit">Time limit (minutes, blank = none)</label>
            <input id="timeLimit" type="number" min={0} {...register("navigation.timeLimitMinutes", { valueAsNumber: true })} />
          </div>
        )}

        {tab === "randomization" && (
          <div role="tabpanel">
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("randomization.shuffleQuestions")} />
              Shuffle question order
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("randomization.shuffleAnswerChoices")} />
              Shuffle answer choices
            </label>
            <label htmlFor="seed">Randomization seed (blank = time-based)</label>
            <input id="seed" type="number" {...register("randomization.seed", { valueAsNumber: true })} />
          </div>
        )}

        {tab === "results" && (
          <div role="tabpanel">
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("results.showScore")} />
              Show score
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("results.showPassFailStatus")} />
              Show pass/fail status
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("results.showCorrectAnswers")} />
              Show correct answers after submission
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("results.showQuestionFeedback")} />
              Show question-level feedback
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("results.showMissedQuestionsOnly")} />
              Show missed questions only
            </label>
            <label htmlFor="feedbackTiming">Feedback timing</label>
            <select id="feedbackTiming" {...register("results.feedbackTiming")}>
              <option value="immediately">Immediately</option>
              <option value="afterLeavingQuestion">After leaving the question</option>
              <option value="afterSubmit">After submitting</option>
              <option value="onlyAfterPassing">Only after passing</option>
              <option value="onlyAfterFinalAttempt">Only after the final attempt</option>
              <option value="never">Never</option>
            </select>
            <label htmlFor="passingMessage">Custom passing message</label>
            <textarea id="passingMessage" rows={2} {...register("results.passingMessage")} />
            <label htmlFor="failingMessage">Custom failing message</label>
            <textarea id="failingMessage" rows={2} {...register("results.failingMessage")} />
          </div>
        )}

        {tab === "scorm" && (
          <div role="tabpanel">
            <p className="sq-help-text">SCORM 2004 4th Edition is the only supported version in this build.</p>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("scorm.reportSuccessStatus")} />
              Report success status (pass/fail) to the LMS
            </label>
            <label className="sq-checkbox-label">
              <input type="checkbox" {...register("scorm.reportInteractions")} />
              Report question-level interactions to the LMS
            </label>
            <label htmlFor="masteryScore">Mastery score (0-1, optional manifest sequencing hint)</label>
            <input id="masteryScore" type="number" min={0} max={1} step={0.05} {...register("scorm.masteryScore", { valueAsNumber: true })} />
            <label htmlFor="apiDepth">API search max parent-window depth</label>
            <input id="apiDepth" type="number" min={1} max={20} {...register("scorm.apiSearchMaxParentDepth", { valueAsNumber: true })} />
          </div>
        )}
      </form>
    </div>
  );
}
