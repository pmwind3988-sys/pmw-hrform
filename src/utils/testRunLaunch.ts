/**
 * testRunLaunch.ts — the pure, easily-tested half of "launch a test run"
 * from the form builder.
 *
 * `sampleAnswersFor` fills a survey with recognisably-fake answers so a
 * tester rehearsing a workflow does not have to type through every field by
 * hand; it deliberately leaves anything it cannot confidently guess (a
 * signature, a file upload) blank rather than risk submitting garbage.
 *
 * `testRunFormUrl` builds the link a "Start test run" action opens. This app
 * has exactly one form route — `/form/:formId` (see `src/App.tsx`) — so
 * there is no public/signed-in split to encode here.
 */

type SurveyElement = {
  type?: string;
  name?: string;
  inputType?: string;
  choices?: (string | { value?: unknown; text?: unknown })[];
  elements?: SurveyElement[];
  rateMin?: number;
  rateMax?: number;
};

type SurveyPage = { elements?: SurveyElement[] };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstChoiceValue(choices: SurveyElement["choices"]): unknown {
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (first && typeof first === "object") {
    return (first as { value?: unknown; text?: unknown }).value ?? (first as { value?: unknown; text?: unknown }).text;
  }
  return first;
}

function sampleValueFor(el: SurveyElement): unknown {
  const type = el.type;
  const name = el.name || "";

  if (type === "text") {
    if (el.inputType === "number") return 1;
    if (el.inputType === "date") return todayIso();
    return `Test answer — ${name}`;
  }
  if (type === "comment") {
    return `This is a test answer submitted during a rehearsal of the ${name || "form"} question.`;
  }
  if (type === "dropdown" || type === "radiogroup" || type === "checkbox") {
    const value = firstChoiceValue(el.choices);
    if (value === undefined) return undefined;
    return type === "checkbox" ? [value] : value;
  }
  if (type === "boolean") return true;
  if (type === "rating") {
    const min = typeof el.rateMin === "number" ? el.rateMin : 1;
    const max = typeof el.rateMax === "number" ? el.rateMax : 5;
    return Math.round((min + max) / 2);
  }
  return undefined;
}

/**
 * Walks every page/element of a published SurveyJSON document and returns
 * sample answers for the question types it confidently understands. Any
 * other type — signature pads, file uploads, matrices — is left out of the
 * result entirely, so the tester fills it in themselves rather than
 * submitting a guess that looks real but is not.
 */
export function sampleAnswersFor(surveyJson: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  const pages = (surveyJson as { pages?: SurveyPage[] })?.pages;
  if (!Array.isArray(pages)) return answers;

  const walk = (elements: SurveyElement[] | undefined) => {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (el.name) {
        const value = sampleValueFor(el);
        if (value !== undefined) answers[el.name] = value;
      }
      if (Array.isArray(el.elements)) walk(el.elements);
    }
  };

  for (const page of pages) walk(page?.elements);
  return answers;
}

/**
 * The link a "Start test run" action opens. There is only one form route in
 * this app, so this always builds `/form/{slug}` with the signed ticket
 * carried in the query string — the server reads the authoritative test
 * address out of that ticket, never out of anything else in the URL.
 */
export function testRunFormUrl(params: { slug: string; ticket: string }): string {
  const query = new URLSearchParams({ testTicket: params.ticket });
  return `/form/${encodeURIComponent(params.slug)}?${query.toString()}`;
}
