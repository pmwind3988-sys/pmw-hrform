/**
 * Published SurveyJSON + a stored response → the sections the approval and
 * evaluation screens print through `ReadOnlySubmissionPreview`.
 *
 * It lives here rather than in the component so it can be tested without one:
 * the preview has no state of its own worth rendering in a test, and the part
 * that goes wrong is this walk.
 *
 * `formSubmissionLayout.ts` does the same job for the dashboard's detail modal
 * and the PDF. The two are deliberately separate — that one reads SharePoint's
 * escaped response keys and carries the metadata a PDF needs, while this one
 * only shows what the submission actually stored — but they order their output
 * by the same rule, described below.
 */

export interface SubmissionPreviewField {
  name: string;
  title: string;
  type: string;
  inputType?: string;
  choices?: unknown[];
  rateValues?: unknown[];
  columns?: unknown[];
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  currency?: string;
  currencySymbol?: string;
  locale?: string;
  decimalPlaces?: number;
  displayFormat?: string;
}

export interface SubmissionPreviewSection {
  /** Empty on a section that resumes the one above it after a nested panel. */
  title: string;
  fields: SubmissionPreviewField[];
}

/** Where the fields at one level of the form are currently landing. */
interface SectionRun {
  current: SubmissionPreviewSection | null;
  titled: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatFieldLabel(key: string): string {
  return key
    .replace(/_x0020_/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

function fieldTitle(element: Record<string, unknown>): string {
  const title = element.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = element.name;
  return typeof name === "string" ? formatFieldLabel(name) : "Untitled field";
}

function sectionTitle(element: Record<string, unknown>, fallback: string): string {
  const title = element.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = element.name;
  return typeof name === "string" && name.trim() ? formatFieldLabel(name) : fallback;
}

/**
 * A page the form builder never renamed carries SurveyJS's own `page1` /
 * `page2`, which reads as a machine label in a printed record. The first page
 * is the form itself, so it prints as "Main Page"; later ones keep their
 * number.
 */
function pageTitle(page: Record<string, unknown>, index: number): string {
  const title = page.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = typeof page.name === "string" ? page.name.trim() : "";
  if (!name || /^page[\s_-]*\d*$/i.test(name)) {
    return index === 0 ? "Main Page" : `Page ${index + 1}`;
  }
  return formatFieldLabel(name);
}

function getSurveyRoot(surveyJson: unknown): Record<string, unknown> | null {
  if (!isRecord(surveyJson)) return null;
  if (isRecord(surveyJson.surveyJson)) return surveyJson.surveyJson;
  return surveyJson;
}

/**
 * Sections are pushed as their fields turn up, so the record reads in the order
 * the form asked.
 *
 * Panel sections used to be pushed on the way past while the page's own fields
 * waited in one list until the walk finished, which sank every question that
 * was not inside a panel to the bottom of the preview no matter where it had
 * been asked. A run of fields resuming after a panel therefore opens a section
 * of its own, and carries no heading — repeating the one above would read as a
 * second section rather than as the rest of it.
 */
export function collectPreviewSections(
  surveyJson: unknown,
  data: Record<string, unknown> | null,
): SubmissionPreviewSection[] {
  const root = getSurveyRoot(surveyJson);
  const pages = root && Array.isArray(root.pages) ? root.pages : [];
  const sections: SubmissionPreviewSection[] = [];
  const dataKeys = new Set(Object.keys(data ?? {}));

  const collectFields = (elements: unknown, title: string, run: SectionRun) => {
    if (!Array.isArray(elements)) return;
    for (const raw of elements) {
      if (!isRecord(raw)) continue;
      const type = typeof raw.type === "string" ? raw.type : "";
      if (type === "panel") {
        collectFields(raw.elements, sectionTitle(raw, "Section"), { current: null, titled: false });
        // What follows the panel was asked after it, so it starts a section of
        // its own rather than joining the one this level had open.
        run.current = null;
        continue;
      }
      if (type === "html" || type === "expression" || type === "formula") continue;
      const name = typeof raw.name === "string" ? raw.name : "";
      if (!name || !dataKeys.has(name)) continue;
      if (!run.current) {
        run.current = { title: run.titled ? "" : title, fields: [] };
        run.titled = true;
        sections.push(run.current);
      }
      run.current.fields.push({
        name,
        title: fieldTitle(raw),
        type,
        inputType: typeof raw.inputType === "string" ? raw.inputType : undefined,
        choices: Array.isArray(raw.choices) ? raw.choices : undefined,
        rateValues: Array.isArray(raw.rateValues) ? raw.rateValues : undefined,
        columns: Array.isArray(raw.columns) ? raw.columns : undefined,
        rateMin: typeof raw.rateMin === "number" ? raw.rateMin : undefined,
        rateMax: typeof raw.rateMax === "number" ? raw.rateMax : undefined,
        minRateDescription: typeof raw.minRateDescription === "string" ? raw.minRateDescription : undefined,
        maxRateDescription: typeof raw.maxRateDescription === "string" ? raw.maxRateDescription : undefined,
        currency: typeof raw.currency === "string" ? raw.currency : undefined,
        currencySymbol: typeof raw.currencySymbol === "string" ? raw.currencySymbol : undefined,
        locale: typeof raw.locale === "string" ? raw.locale : undefined,
        decimalPlaces: typeof raw.decimalPlaces === "number" ? raw.decimalPlaces : undefined,
        displayFormat: typeof raw.displayFormat === "string" ? raw.displayFormat : undefined,
      });
    }
  };

  pages.forEach((page, index) => {
    if (!isRecord(page)) return;
    collectFields(page.elements, pageTitle(page, index), { current: null, titled: false });
  });

  // A section is created by the field that goes into it, so none can be empty.
  return sections;
}
