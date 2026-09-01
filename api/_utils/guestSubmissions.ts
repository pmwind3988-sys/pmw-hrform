import { queryAllListItems, type GraphListItem } from "./graphClient.js";
import { logWarn } from "./logger.js";

/**
 * "What have I sent you?" for a guest member — their job applications and the
 * HR forms they have submitted, in one place.
 *
 * Applying for a job or submitting a form used to be the end of the
 * conversation: the person pressed send and had no way back in to see what
 * happened next. A permanent membership is what makes an answer possible.
 */

const APPLICATION_LIST = "Job Applications";
const MASTER_FORM_LIST = "Master Form";

/**
 * How many form definitions are searched.
 *
 * Every HR form writes to a response list of its own — there is no single table
 * of submissions to filter — so this walks the registry and asks each list in
 * turn. That is one read per form, which is why it is capped and why it runs
 * only on a member's own request — once, when their page opens, never on a
 * timer. If the number of forms ever grows past this, the right fix is an index
 * of submissions by submitter, not a bigger number here.
 */
const MAX_FORMS_SEARCHED = 60;

/** A hard ceiling on rows read from any one list. */
const MAX_ROWS_PER_LIST = 2000;

export interface GuestSubmission {
  kind: "job-application" | "form";
  /** The job title, or the form name. */
  title: string;
  reference: string;
  status: string;
  submittedAt: string;
}

function firstText(fields: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

/**
 * SharePoint's own creation timestamp, used when a list carries no submission
 * date of its own. Every item has one, so a submission never sorts as undated
 * purely because its form was built without a date column.
 */
function createdAt(item: GraphListItem): string {
  const fields = item.fields || {};
  return firstText(fields, ["SubmittedAt", "SubmissionDate", "Created"]) || "";
}

async function readJobApplications(
  graphToken: string,
  email: string,
): Promise<GuestSubmission[]> {
  let items: GraphListItem[];
  try {
    items = await queryAllListItems(graphToken, APPLICATION_LIST, { maxItems: MAX_ROWS_PER_LIST });
  } catch (error) {
    logWarn("api:guest", "Could not read job applications for a member", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  return items
    .filter((item) => {
      const fields = item.fields || {};
      const applicant = firstText(fields, [
        "ApplicantEmail",
        "Applicant_x0020_Email",
        "Email",
      ]).toLowerCase();
      return applicant === email;
    })
    .map((item) => {
      const fields = item.fields || {};
      return {
        kind: "job-application" as const,
        title: firstText(fields, ["JobTitle", "Job_x0020_Title", "Title"]) || "Job application",
        reference: firstText(fields, ["ReferenceNumber", "Reference_x0020_Number", "Title"]),
        status: firstText(fields, ["Status", "ApplicationStatus"]) || "Submitted",
        submittedAt: createdAt(item),
      };
    });
}

async function readFormSubmissions(
  graphToken: string,
  email: string,
): Promise<GuestSubmission[]> {
  let forms: GraphListItem[];
  try {
    forms = await queryAllListItems(graphToken, MASTER_FORM_LIST, { maxItems: MAX_FORMS_SEARCHED });
  } catch (error) {
    logWarn("api:guest", "Could not read the form registry for a member", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const listTitles = Array.from(
    new Set(
      forms
        .map((form) => String(form.fields?.Title ?? "").trim())
        .filter((title) => title.length > 0),
    ),
  );

  const found: GuestSubmission[] = [];
  for (const listTitle of listTitles) {
    let items: GraphListItem[];
    try {
      items = await queryAllListItems(graphToken, listTitle, { maxItems: MAX_ROWS_PER_LIST });
    } catch {
      // A form whose response list is missing or unreadable is skipped rather
      // than failing the page: one broken form must not hide every submission
      // this person ever made.
      continue;
    }

    for (const item of items) {
      const fields = item.fields || {};
      if (firstText(fields, ["SubmittedBy"]).toLowerCase() !== email) continue;
      found.push({
        kind: "form",
        title: listTitle,
        reference: firstText(fields, ["ReferenceNumber", "Reference_x0020_Number", "Title"]),
        status: firstText(fields, ["Status", "ApprovalStatus"]) || "Submitted",
        submittedAt: createdAt(item),
      });
    }
  }

  return found;
}

/**
 * Everything one member has sent, newest first.
 *
 * **History starts when guest members ship.** A public form submission used to
 * record the literal text `GUEST` as its submitter, with nothing to tie it back
 * to a person, so submissions made before this feature existed cannot appear
 * here and never will. Nothing is lost that was ever recorded — it simply was
 * not recorded. From launch onward `api/submit-form.ts` stamps the member's
 * session-verified address over that word, which is what these reads match on.
 */
export async function readGuestSubmissions(
  graphToken: string,
  rawEmail: string,
): Promise<GuestSubmission[]> {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email) return [];

  const [applications, forms] = await Promise.all([
    readJobApplications(graphToken, email),
    readFormSubmissions(graphToken, email),
  ]);

  return [...applications, ...forms].sort((a, b) => {
    if (!a.submittedAt) return 1;
    if (!b.submittedAt) return -1;
    return b.submittedAt.localeCompare(a.submittedAt);
  });
}
