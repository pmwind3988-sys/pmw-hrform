/**
 * reviewQueue.ts — "what is waiting for me?" for a signed-in reviewer.
 *
 * Evaluators used to find their work only through the email for each
 * submission: nine trainees meant nine emails, nine links and nine sign-ins.
 * This lists every step currently assigned to one person so the "Waiting for
 * me" page can walk them through it in one sitting.
 *
 * It is a list, never a gate. Each entry opens the ordinary signed-in reviewer
 * link (`/eval/{slug}/{id}/{layer}`), and `api/evaluate.ts` re-checks
 * everything there — assignment, layer, status — exactly as it does for a link
 * from an email. Leaving something off this list hides it; putting something
 * on it opens nothing.
 *
 * **Signed-in steps only.** A public step is reached by the capability link in
 * its email (`k`, see `linkToken.ts`), and the reviewer page refuses the
 * signed-in shape for it, so listing one here would be a dead link.
 *
 * **A scheduled step waits for its date.** A Training Evaluation asks the HOD
 * three months after the course, on purpose — the HOD has to have watched the
 * trainee work. A step whose email is still scheduled for the future is
 * therefore left off, or the queue would ask for an evaluation before there is
 * anything to evaluate.
 */
import { queryAllListItems, type GraphListItem } from "./graphClient.js";
import { resolveApplicantName } from "./applicantName.js";
import { pickLayerByNumber } from "./layerPick.js";
import {
  denyLayerItemAccess,
  firstUnfinishedEarlierLayer,
  isTerminalFormStatus,
  isTerminalLayerStatus,
} from "./layerItemAccess.js";
import { isLayerActor } from "./layerRecipients.js";
import { logWarn } from "./logger.js";
import { REFERENCE_NO_FIELD } from "./referenceNumber.js";
import { isSuperuserOnlyForm } from "./superuserOnlyForms.js";
import { isTestRow } from "./testRun.js";
import { parseWorkflowEmailSchedule } from "./workflowEmail.js";
import { workflowRoutePrefix } from "./workflowLink.js";

/** Same bounds as the guest "my submissions" walk, for the same reason. */
const MAX_FORMS_SEARCHED = 80;
const MAX_ROWS_PER_LIST = 5000;
/** Lists read at once. Enough to keep the page quick, few enough not to trip Graph throttling. */
const READ_CONCURRENCY = 6;

export interface ReviewQueueEntry {
  formTitle: string;
  formSlug: string;
  responseItemId: string;
  layerNumber: number;
  layerType: "approval" | "evaluation";
  layerTitle: string;
  referenceNo: string;
  applicantName: string;
  submittedBy: string;
  /** When this step became the reviewer's to do, as best the record says. */
  waitingSince: string;
  /** App-relative signed-in reviewer link. */
  link: string;
}

type LayerConfigShape = {
  layers?: Record<string, unknown>[];
  manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[];
};

export interface QueueForm {
  title: string;
  slug: string;
  layerConfig: LayerConfigShape | null;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function parseLayerConfig(raw: unknown): LayerConfigShape | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as LayerConfigShape : null;
  } catch {
    return null;
  }
}

/** Statuses a step is parked in when nobody can act on it online. */
function isParkedLayerStatus(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return normalized === "needs routing"
    || normalized === "manual evaluation required"
    || normalized === "manual approval required";
}

/**
 * The one step on this submission waiting for `viewerEmail`, or null.
 *
 * Pure, so the rules can be tested without SharePoint. Each refusal below
 * mirrors one the reviewer page would make, so the queue never lists a step the
 * page then turns away.
 */
export function queueEntryForViewer(
  form: QueueForm,
  item: { id: string; fields: Record<string, unknown> },
  viewerEmail: string,
  now = new Date(),
): ReviewQueueEntry | null {
  const fields = item.fields;
  if (isTestRow(fields)) return null;
  if (isTerminalFormStatus(fields.FormStatus) || isTerminalFormStatus(fields.Status)) return null;

  const layerNumber = Number(fields.CurrentLayer || fields.CurrentApprovalLayer || 0);
  if (!layerNumber) return null;
  const layerStatus = fields[`L${layerNumber}_Status`];
  if (isTerminalLayerStatus(layerStatus) || isParkedLayerStatus(layerStatus)) return null;

  if (!isLayerActor(viewerEmail, fields[`L${layerNumber}_Emails`], fields[`L${layerNumber}_Email`])) return null;

  const layer = pickLayerByNumber(form.layerConfig, text(fields.SelectedBranch), layerNumber);
  if (!layer) return null;
  if (text(layer.authMode) === "public") return null;

  if (denyLayerItemAccess({
    layerNumber,
    currentLayer: layerNumber,
    layerStatus,
    formStatus: fields.FormStatus,
    intent: "act",
    layer,
    fields,
    now,
  })) return null;

  const earlier = Array.from({ length: layerNumber - 1 }, (_, i) => i + 1)
    .map((n) => ({ layerNumber: n, status: fields[`L${n}_Status`] }));
  if (firstUnfinishedEarlierLayer(earlier, layerNumber) !== null) return null;

  const scheduled = parseWorkflowEmailSchedule(fields.WorkflowEmailSchedule)[String(layerNumber)];
  const dueTime = scheduled ? Date.parse(scheduled.dueAt) : NaN;
  if (scheduled && scheduled.status === "scheduled" && Number.isFinite(dueTime) && dueTime > now.getTime()) {
    return null;
  }

  const layerType = text(layer.type) === "evaluation" ? "evaluation" : "approval";
  const waitingSince = (Number.isFinite(dueTime) ? scheduled?.dueAt : "")
    || text(fields[`L${layerNumber - 1}_SignedAt`])
    || text(fields.SubmittedAt)
    || text(fields.Created);

  return {
    formTitle: form.title,
    formSlug: form.slug,
    responseItemId: String(item.id),
    layerNumber,
    layerType,
    layerTitle: text(layer.title),
    referenceNo: text(fields[REFERENCE_NO_FIELD]),
    applicantName: resolveApplicantName(fields),
    submittedBy: text(fields.SubmittedBy),
    waitingSince,
    link: `/${workflowRoutePrefix(layerType)}/${encodeURIComponent(form.slug)}/${encodeURIComponent(String(item.id))}/${layerNumber}`,
  };
}

/** Longest-waiting first, so the overdue ones are done before the fresh ones. */
export function sortReviewQueue(entries: ReviewQueueEntry[]): ReviewQueueEntry[] {
  return [...entries].sort((a, b) => {
    const at = Date.parse(a.waitingSince);
    const bt = Date.parse(b.waitingSince);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1;
    return a.formTitle.localeCompare(b.formTitle) || Number(a.responseItemId) - Number(b.responseItemId);
  });
}

async function mapLimited<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await fn(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Every step waiting for this person, across every form.
 *
 * Every form writes to a response list of its own, so this walks the registry
 * and reads each list, as `guestSubmissions.ts` does. It runs once per page
 * open, on the reviewer's own request — never on a timer.
 */
export async function readReviewQueue(
  graphToken: string,
  rawEmail: string,
): Promise<{ entries: ReviewQueueEntry[]; formsSkipped: number }> {
  const email = text(rawEmail).toLowerCase();
  if (!email) return { entries: [], formsSkipped: 0 };

  const registry: GraphListItem[] = await queryAllListItems(graphToken, "Master Form", { maxItems: MAX_FORMS_SEARCHED });
  const forms: QueueForm[] = registry
    .map((form) => ({
      title: text(form.fields?.Title),
      slug: text(form.fields?.Slug),
      layerConfig: parseLayerConfig(form.fields?.LayerConfig),
    }))
    // Test-only forms are rehearsals; their steps belong to the tester, not to
    // the real people they are nominally routed to.
    .filter((form) => form.title && form.slug && form.layerConfig && !isSuperuserOnlyForm(form.title));

  let formsSkipped = 0;
  const perForm = await mapLimited(forms, READ_CONCURRENCY, async (form) => {
    let items: GraphListItem[];
    try {
      items = await queryAllListItems(graphToken, form.title, { maxItems: MAX_ROWS_PER_LIST });
    } catch (error) {
      // One unreadable list must not hide every other form's work.
      formsSkipped++;
      logWarn("api:review-queue", "Could not read a response list for the review queue", {
        formTitle: form.title,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    return items
      .map((item) => queueEntryForViewer(form, { id: String(item.id), fields: item.fields || {} }, email))
      .filter((entry): entry is ReviewQueueEntry => entry !== null);
  });

  return { entries: sortReviewQueue(perForm.flat()), formsSkipped };
}
