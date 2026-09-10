import type { Assessment, Question } from "@scorm-quiz/schemas";

/** The learner-facing runtime needs isCorrect/scoreValue to score client-side
 * (SCORM packages must work fully offline with no server round-trip), but
 * authoring-only fields (SME notes, developer notes, tags, workflow status)
 * are internal and are stripped so they never ship inside the package. */
function stripAuthoringFields(question: Question): Question {
  const { developerNotes, smeNotes, tags, status, ...rest } = question;
  void developerNotes;
  void smeNotes;
  void tags;
  void status;
  return { ...rest, tags: [], status: "approved" } as Question;
}

export interface RuntimeConfig {
  assessment: Assessment;
}

/** Builds the assessment-config.json baked into the exported package. */
export function buildRuntimeConfig(assessment: Assessment): RuntimeConfig {
  return {
    assessment: {
      ...assessment,
      questions: assessment.questions.map(stripAuthoringFields),
    },
  };
}
