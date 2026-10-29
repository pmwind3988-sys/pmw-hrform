/**
 * evaluationQuestionMatch.ts — which copy of a step's evaluation questions a
 * stored evaluation was answered against.
 *
 * A form published through a separate link carries its own copy of each step,
 * and those questions may be named differently from the main link's. Until the
 * reviewer page read the submission's own link, evaluators were shown the main
 * link's questions, so their answers were saved under names the link's copy
 * does not use — and the PDF, reading the link's copy, printed them blank.
 *
 * Whoever prints an evaluation therefore offers every copy it knows of, the
 * submission's own first, and prints the one the saved answers actually match.
 */

type El = Record<string, unknown>;

const isRecord = (value: unknown): value is El =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const CHILD_KEYS = ["elements", "templateElements", "questions"] as const;

/** Every question name in a list of survey elements, panels included. */
export function evaluationQuestionNames(elements: readonly El[]): Set<string> {
  const names = new Set<string>();
  const walk = (list: readonly unknown[]) => {
    for (const el of list) {
      if (!isRecord(el)) continue;
      if (typeof el.name === "string" && el.name.trim()) names.add(el.name.trim());
      for (const key of CHILD_KEYS) {
        if (Array.isArray(el[key])) walk(el[key] as unknown[]);
      }
    }
  };
  walk(elements);
  return names;
}

/**
 * The candidate whose questions match the most saved answers. Ties, and an
 * evaluation with no answers yet, go to the earliest candidate, so the
 * submission's own copy wins whenever it is not plainly the wrong one.
 */
export function questionsMatchingAnswers(
  candidates: readonly (readonly El[] | undefined)[],
  answers: Record<string, unknown> | undefined,
): El[] | undefined {
  const usable = candidates.filter((c): c is readonly El[] => Array.isArray(c) && c.length > 0);
  if (usable.length === 0) return undefined;
  const answered = Object.keys(answers ?? {});
  let best = usable[0];
  let bestHits = -1;
  for (const candidate of usable) {
    const names = evaluationQuestionNames(candidate);
    const hits = answered.filter((key) => names.has(key)).length;
    if (hits > bestHits) {
      best = candidate;
      bestHits = hits;
    }
  }
  return [...best];
}
